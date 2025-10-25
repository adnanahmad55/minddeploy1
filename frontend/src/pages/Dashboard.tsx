// Dashboard.tsx - FINAL CODE (Added Name Credit & Fixed Typos)

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
    Brain,
    Swords,
    Trophy,
    Star,
    Users,
    LogOut,
    DollarSign,
    LineChart,
    BarChart,
    BookOpen
} from 'lucide-react';

// NOTE: VITE_API_URL should be the base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface UserStats {
    debates_won: number;
    debates_lost: number;
    debates_competed: number;
}

interface DebateHistory {
    id: number;
    topic: string;
    opponent_username: string;
    winner: string | null;
    date: string; // Assuming date is pre-formatted
}

const Dashboard = () => {
    const { user, logout, token } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState<UserStats | null>(null);
    const [history, setHistory] = useState<DebateHistory[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const getInitials = (name: string) => {
         if (!name) return 'U'; // Handle null or undefined name
        return name.split(' ').map(n => n[0]).join('').toUpperCase() || 'U';
    };

    const handleLogout = () => {
        logout();
        toast({ title: "Logged out", description: "You have been successfully logged out." });
        navigate('/login');
    };

    useEffect(() => {
        if (!token || !user) { // Added user check
            setIsLoading(false);
            return; // Don't fetch if no token or user
        }

        const fetchDashboardData = async () => {
            setIsLoading(true);
            try {
                // Fetch stats and history in parallel
                const [statsResponse, historyResponse] = await Promise.all([
                    fetch(`${API_BASE}/dashboard/stats`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }),
                    fetch(`${API_BASE}/dashboard/history`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                ]);

                if (statsResponse.ok) {
                    const statsData = await statsResponse.json();
                    setStats(statsData);
                } else {
                    console.error("Failed to fetch stats");
                    toast({ title: "Error", description: "Could not load user statistics.", variant: "destructive" });
                }

                if (historyResponse.ok) {
                    const historyData = await historyResponse.json();
                    setHistory(historyData);
                } else {
                    console.error("Failed to fetch history");
                    toast({ title: "Error", description: "Could not load debate history.", variant: "destructive" });
                }

            } catch (error) {
                console.error("Error fetching dashboard data:", error);
                toast({ title: "Network Error", description: "Failed to connect to the server.", variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, [token, user]); // Added user to dependency array

    // Calculate Win Rate
    const winRate = stats && stats.debates_competed > 0
        ? ((stats.debates_won / stats.debates_competed) * 100).toFixed(0)
        : 0;

    return (
        <div className="min-h-screen bg-gradient-bg text-white">
            {/* --- HEADER / NAVBAR --- */}
            <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-card/20 backdrop-blur-sm">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    
                    {/* --- CRITICAL UI FIX: Logo and Credit --- */}
                    <div className="flex items-center space-x-4">
                        {/* Logo and Credit Stack */}
                        <div className="flex flex-col items-start -space-y-1"> {/* Changed to flex-col */}
                            <Link to="/dashboard" className="flex items-center space-x-2">
                                <Brain className="h-6 w-6 text-cyber-red" />
                                <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                                    MindGrid
                                </span>
                            </Link>
                            {/* ADD THIS LINE */}
                            <p className="text-xs text-muted-foreground opacity-75 pl-1" style={{marginTop: '1px'}}>Made by Adnan Ahmad</p>
                        </div>
                    </div>
                    {/* --- END CRITICAL UI FIX --- */}

                    {/* Navigation Links */}
                    <nav className="hidden md:flex items-center space-x-6">
                        <Link to="/leaderboard" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                            Leaderboard
                        </Link>
                        <Link to="/forums" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                            Forums
                        </Link>
                        <Link to="/redeem" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                            Redeem
                        </Link>
                    </nav>

                    {/* User Profile / Auth */}
                    <div className="flex items-center space-x-4">
                        {user ? (
                            <>
                                <span className="hidden sm:inline text-sm text-muted-foreground">
                                    Welcome back, {user.username}
                                </span>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                                            <Avatar className="h-8 w-8">
                                                {/* <AvatarImage src={user.avatarUrl} alt={user.username} /> */}
                                                <AvatarFallback className="bg-cyber-red/50 text-white">
                                                    {getInitials(user.username)}
                                                </AvatarFallback>
                                            </Avatar>
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-56" align="end" forceMount>
                                        <DropdownMenuLabel className="font-normal">
                                            <div className="flex flex-col space-y-1">
                                                <p className="text-sm font-medium leading-none">{user.username}</p>
                                                <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                                            </div>
                                        </DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                                            Dashboard
                                        </DropdownMenuItem>
                                        {/* <DropdownMenuItem onClick={() => navigate('/profile')}>
                                            Profile (Settings)
                                        </DropdownMenuItem> */}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={handleLogout} className="text-cyber-red focus:text-cyber-red focus:bg-cyber-red/10">
                                            <LogOut className="mr-2 h-4 w-4" />
                                            Log out
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </>
                        ) : (
                            // Show login button if user is null and not loading
                            !isLoading && <Button onClick={() => navigate('/login')}>Login</Button>
                        )}
                    </div>
                </div>
            </header>
            {/* --- END HEADER --- */}


            {/* --- MAIN CONTENT --- */}
            <main className="container mx-auto px-4 py-8">
                {/* Hero Section */}
                <Card className="mb-8 bg-gradient-card border-border/50 shadow-cyber overflow-hidden">
                    <div className="flex flex-col md:flex-row items-center">
                        <div className="p-8 md:w-1/2">
                            <h2 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
                                Ready for battle?
                            </h2>
                            <p className="text-lg text-muted-foreground mb-6">
                                Enter the neural arena and test your debating skills against humans or our advanced AI.
                            </p>
                            <Button
                                size="lg"
                                className="bg-cyber-red hover:bg-cyber-red/80 text-white shadow-lg"
                                onClick={() => navigate('/matchmaking')}
                            >
                                <Swords className="mr-2 h-5 w-5" /> Start Debate
                            </Button>
                        </div>
                        <div className="md:w-1/2 h-48 md:h-full min-h-[200px]">
                            {/* Image with fallback */}
                             <img
                                 src="https://stellar-connection-production.up.railway.app/assets/hero-debate-arena-_sFoOAw5.jpg"
                                 alt="Debate Arena"
                                 className="w-full h-full object-cover"
                                 onError={(e) => (e.currentTarget.src = 'https://placehold.co/600x300/200A0A/E03A3E?text=Arena+Image')}
                             />
                        </div>
                    </div>
                </Card>

                {/* Stats Section */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* ELO Rating */}
                    <Card className="bg-card/50 border-border/50">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">ELO Rating</CardTitle>
                            <Trophy className="h-4 w-4 text-cyber-gold" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-cyber-gold">
                                {isLoading ? '...' : (user?.elo ?? '1000')}
                            </div>
                            <p className="text-xs text-muted-foreground">Your current skill ranking</p>
                        </CardContent>
                    </Card>

                    {/* Mind Tokens */}
                    <Card className="bg-card/50 border-border/50">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Mind Tokens</CardTitle>
                            <DollarSign className="h-4 w-4 text-cyber-green" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-cyber-green">
                                {isLoading ? '...' : (user?.mind_tokens ?? '0')}
                            </div>
                            <p className="text-xs text-muted-foreground">Earn tokens by winning debates</p>
                        </CardContent>
                    </Card>

                    {/* Win Rate */}
                    <Card className="bg-card/50 border-border/50">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
                            <Star className="h-4 w-4 text-cyber-blue" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-cyber-blue">
                                {isLoading ? '...' : `${winRate}%`}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {isLoading ? '...' : `${stats?.debates_won ?? 0} wins / ${stats?.debates_competed ?? 0} total`}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Other Actions Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                     {/* Leaderboard */}
                     <Card className="bg-card/50 border-border/50 hover:bg-card/70 transition-colors">
                         <CardHeader className="flex flex-row items-center space-x-4">
                             <BarChart className="h-8 w-8 text-cyber-red" />
                             <div>
                                 <CardTitle className="text-lg font-semibold">Leaderboard</CardTitle>
                                 <CardDescription className="text-muted-foreground">See how you stack up</CardDescription>
                             </div>
                         </CardHeader>
                         <CardContent>
                             <Button onClick={() => navigate('/leaderboard')}>View Rankings</Button>
                         </CardContent>
                     </Card>

                     {/* Forums */}
                     <Card className="bg-card/50 border-border/50 hover:bg-card/70 transition-colors">
                         <CardHeader className="flex flex-row items-center space-x-4">
                             <BookOpen className="h-8 w-8 text-cyber-blue" />
                             <div>
                                 <CardTitle className="text-lg font-semibold">Forums</CardTitle>
                                 <CardDescription className="text-muted-foreground">Discuss topics and strategy</CardDescription>
                             </div>
                         </CardHeader>
                         <CardContent>
                             <Button onClick={() => navigate('/forums')}>Join Discussion</Button>
                         </CardContent>
                     </Card>
                </div>


                {/* Debate History */}
                <Card className="bg-card/50 border-border/50">
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <LineChart className="h-5 w-5 mr-2" />
                            Recent Debate History
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <p className="text-muted-foreground">Loading history...</p>
                        ) : history.length > 0 ? (
                            <ul className="space-y-4">
                                {history.map((debate) => (
                                    <li key={debate.id} className="flex items-center justify-between p-3 bg-input/50 rounded-lg border border-border/50">
                                        <div>
                                            <p className="font-semibold text-foreground">{debate.topic}</p>
                                            <p className="text-sm text-muted-foreground">vs {debate.opponent_username}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-bold ${
                                                debate.winner === user?.username ? 'text-cyber-green' :
                                                debate.winner === 'Draw' ? 'text-cyber-gold' :
                                                debate.winner === null ? 'text-muted-foreground' : 'text-cyber-red'
                                            }`}>
                                                {/* --- CRITICAL FIX: Changed debate.t to debate.winner --- */}
                                                {debate.winner === user?.username ? 'Victory' :
                                                 debate.winner === 'Draw' ? 'Draw' :
                                                 debate.winner == null ? 'Pending' : 'Defeat'}
                                                {/* --- END FIX --- */}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{new Date(debate.date).toLocaleDateString()}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-muted-foreground">No debate history found. Time to battle!</p>
                        )}
                    </CardContent>
                </Card>

            </main>
        </div>
    );
};

export default Dashboard;