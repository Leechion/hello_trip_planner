import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { Providers } from "@/components/providers"
import Layout from "@/layout"
import Home from "@/pages/home"
import Login from "@/pages/login"
import History from "@/pages/history"
import HistoryDetail from "@/pages/history-detail"
import Share from "@/pages/share"
import Profile from "@/pages/profile"
import ConversationHistoryPage from "@/pages/conversation-history"
import ChatDetailPage from "@/pages/chat-detail"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Providers>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/history" element={<History />} />
            <Route path="/history/:id" element={<HistoryDetail />} />
            <Route path="/share/:token" element={<Share />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/conversations" element={<ConversationHistoryPage />} />
            <Route path="/chat/:id" element={<ChatDetailPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </Providers>
  </React.StrictMode>
)
