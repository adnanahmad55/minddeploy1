import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Matchmaking from "./pages/Matchmaking";
import Debate from "./pages/Debate";
import Result from "./pages/Result";
import NotFound from "./pages/NotFound";
import Leaderboard from "./pages/Leaderboard";
import Redeem from "./pages/Redeem";
import Forums from "./pages/Forums";
import Threads from "./pages/Threads";
import Posts from "./pages/Posts";
import Analysis from "./pages/Analysis";
import ChatRoom from "./pages/ChatRoom"; // <--- IMPORT ChatRoom

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-bg flex items-center justify-center">
        <div className="animate-pulse text-cyber-red">Loading neural interface...</div>
      </div>
    );
  }
  
  return user ? <>{children}</> : <Navigate to="/login" />;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-bg flex items-center justify-center">
        <div className="animate-pulse text-cyber-red">Loading neural interface...</div>
      </div>
    );
  }
  
  return user ? <Navigate to="/dashboard" /> : <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" />} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/matchmaking" element={<ProtectedRoute><Matchmaking /></ProtectedRoute>} />
            <Route path="/debate" element={<ProtectedRoute><Debate /></ProtectedRoute>} />
            <Route path="/result" element={<ProtectedRoute><Result /></ProtectedRoute>} />
            <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
            <Route path="/redeem" element={<ProtectedRoute><Redeem /></ProtectedRoute>} />
            <Route path="/forums" element={<ProtectedRoute><Forums /></ProtectedRoute>} />
            <Route path="/forums/:forumId/threads" element={<ProtectedRoute><Threads /></ProtectedRoute>} />
            <Route path="/threads/:threadId/posts" element={<ProtectedRoute><Posts /></ProtectedRoute>} />
            <Route path="/analysis/:debateId" element={<ProtectedRoute><Analysis /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
            <Route path="/ChatRoom" element={<ProtectedRoute><ChatRoom /></ProtectedRoute>} /> {/* <--- Make sure casing matches */}
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
