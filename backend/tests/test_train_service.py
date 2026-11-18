import unittest
from unittest.mock import AsyncMock, Mock, patch
from types import SimpleNamespace

from hello_agents.protocols.mcp.client import MCPClient
from app.services.mcp_session import PersistentMCPTool
from app.services.train_service import TrainService


class TrainServiceTests(unittest.TestCase):
    def test_mcp_result_preserves_ticket_text_and_newlines(self):
        text = 'G1 北京南(telecode:VNP) -> 上海(telecode:SHH) 06:30 -> 11:24 历时：04:54\n- 二等座: 有票 626.5元\n'
        client = MCPClient.__new__(MCPClient)
        client.client = Mock()
        client.client.call_tool = AsyncMock(return_value=SimpleNamespace(content=[SimpleNamespace(text=text)]))
        tool = PersistentMCPTool('12306', ['unused'])
        tool._client = client
        result = tool.run({'action': 'call_tool', 'tool_name': 'get-tickets', 'arguments': {}})
        self.assertEqual(result.split('\n', 1)[1], text)
        self.assertNotIn('TextContent', result)
        self.assertIn('\n- 二等座', result)

    def query(self, result):
        service = TrainService()
        service.mcp_tool = Mock()
        service.mcp_tool.run.side_effect = [
            '工具执行结果:\n{"北京": {"station_code": "BJP"}}',
            '工具执行结果:\n{"上海": {"station_code": "SHH"}}',
            result,
        ]
        return service.search_tickets('北京', '上海', '2026-10-02')

    def test_tool_error_is_not_success(self):
        for text in ('Error: get tickets data failed.', 'Error: The date cannot be earlier than today.'):
            with self.subTest(text=text):
                result = self.query("工具 'get-tickets' 执行结果:\n" + text)
                self.assertFalse(result['ok'])
                self.assertEqual(result['reason'], 'query_failed')

    def test_connection_error_is_not_success(self):
        self.assertFalse(self.query('异步操作失败: connection closed')['ok'])

    def test_empty_tool_result_is_not_success(self):
        self.assertFalse(self.query("工具 'get-tickets' 执行结果:\nNone")['ok'])

    def test_real_empty_search_remains_success(self):
        self.assertTrue(self.query("工具 'get-tickets' 执行结果:\n没有查询到相关车次信息")['ok'])

    def test_city_stations_array_can_be_parsed(self):
        service = TrainService()
        service.mcp_tool = Mock()
        service.mcp_tool.run.return_value = '工具执行结果:\n[{"station_code":"VNP","station_name":"北京南"}]'
        self.assertEqual(service.get_city_stations('北京'), [{'station_code': 'VNP', 'station_name': '北京南'}])


if __name__ == '__main__':
    unittest.main()
