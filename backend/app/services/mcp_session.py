"""MCP 会话复用

问题:`MCPTool.run()` 每次调用都会 `async with MCPClient(...)` —— 新建子进程、
重新握手、再关闭。实测 `uvx amap-mcp-server` 单次启动约 3.8 秒,而
`recommend_attractions` 会按关键词调用多次,单个请求光进程启动就 ~11 秒。

做法:为 MCP 起一个**专用事件循环线程**,在该线程上保持长驻会话。
把"进程启动"从每请求成本降为一次性成本。

注意:不能让每次调用各自 `asyncio.run()`,因为 fastmcp 的会话任务绑定在
创建它的那个事件循环上 —— 循环一关,会话即失效(实测会抛 CancelledError)。
因此这里统一在一个后台循环里 connect / call / disconnect。
"""

import asyncio
import atexit
import threading
from concurrent.futures import Future
from concurrent.futures import TimeoutError as FuturesTimeoutError
from typing import Optional

from hello_agents.protocols.mcp.client import MCPClient


class _LoopThread:
    """专用事件循环线程"""

    def __init__(self):
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self) -> None:
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()

    def run_coro(self, coro, timeout: float = 60.0):
        """在专用循环上执行协程,阻塞等待结果。

        超时时必须显式 cancel:run_coroutine_threadsafe 的 future.result(timeout=...)
        只让调用方放弃等待,协程本身仍会在后台继续跑完,
        导致调用方已经去重建会话、而旧协程还在操作同一个 client。
        """
        future: Future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        try:
            return future.result(timeout=timeout)
        except FuturesTimeoutError:
            future.cancel()
            raise TimeoutError(f"MCP 调用超时（{timeout}s）") from None

    def shutdown(self) -> None:
        if self._loop.is_closed():
            return
        self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread.join(timeout=5)
        if not self._loop.is_closed():
            self._loop.close()


_loop_thread: Optional[_LoopThread] = None
_loop_thread_lock = threading.Lock()


def get_loop_thread() -> _LoopThread:
    global _loop_thread
    with _loop_thread_lock:
        if _loop_thread is None:
            _loop_thread = _LoopThread()
        return _loop_thread


class PersistentMCPTool:
    """长驻 MCP 会话,`run()` 与 MCPTool.run() 兼容

    只支持 `action="call_tool"`(本项目所有调用点都只用这一种)。
    失败时返回以错误文本表示的字符串,与 MCPTool 行为一致,调用方无需改动。
    """

    def __init__(self, name: str, server_command: list, env: Optional[dict] = None):
        self.name = name
        self.server_command = server_command
        self.env = env
        self._client: Optional[MCPClient] = None
        self._lock = threading.Lock()
        self._available_tools: Optional[list] = None

    # ---- 会话管理(调用方需持有 self._lock) ----

    def _connect_locked(self) -> None:
        client = MCPClient(self.server_command, [], env=self.env)
        get_loop_thread().run_coro(client.__aenter__())
        self._client = client

    def _disconnect_locked(self) -> None:
        client, self._client = self._client, None
        if client is None:
            return
        try:
            get_loop_thread().run_coro(client.__aexit__(None, None, None))
        except Exception as e:
            print(f"⚠️  {self.name} MCP 会话关闭失败: {e}")

    # ---- 对外接口 ----

    @property
    def available_tools(self) -> list:
        with self._lock:
            if self._available_tools is None:
                if self._client is None:
                    self._connect_locked()
                self._available_tools = get_loop_thread().run_coro(
                    self._client.client.list_tools()
                )
            return self._available_tools or []

    def run(self, parameters: dict) -> str:
        action = parameters.get("action")
        if action != "call_tool":
            return f"错误：PersistentMCPTool 仅支持 action='call_tool'，收到 {action!r}"

        tool_name = parameters.get("tool_name")
        arguments = parameters.get("arguments", {})
        if not tool_name:
            return "错误：必须指定 tool_name 参数"

        with self._lock:
            if self._client is None:
                try:
                    self._connect_locked()
                except Exception as e:
                    self._client = None
                    return f"MCP 连接失败: {e}"

            try:
                result = get_loop_thread().run_coro(
                    self._client.call_tool(tool_name, arguments)
                )
                return f"工具 '{tool_name}' 执行结果:\n{result}"
            except Exception as e:
                # 会话可能已损坏(子进程退出/管道断开):丢弃它,下次重建
                self._disconnect_locked()
                return f"异步操作失败: {e}"

    def close(self) -> None:
        with self._lock:
            self._disconnect_locked()
            self._available_tools = None


_sessions: list[PersistentMCPTool] = []
_sessions_lock = threading.Lock()


def register_session(tool: PersistentMCPTool) -> PersistentMCPTool:
    """登记会话,供 atexit 统一关闭"""
    with _sessions_lock:
        _sessions.append(tool)
    return tool


def _close_all() -> None:
    with _sessions_lock:
        sessions, _sessions[:] = list(_sessions), []
    for tool in sessions:
        try:
            tool.close()
        except Exception:
            pass


atexit.register(_close_all)
