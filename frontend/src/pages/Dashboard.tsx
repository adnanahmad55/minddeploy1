// Dashboard.tsx - FINAL CODE (Added Name Credit)

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { 
    Brain, 
    Zap, 
    Trophy, 
    Target, 
    TrendingUp, 
    Clock,
    LogOut,
    Swords
} from 'lucide-react';
import heroImage from '@/assets/hero-debate-arena.jpg';

// NOTE: VITE_API_URL should be the base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface DebateHistory {
    id: number;
    topic: string;
    opponent_username: string;
    winner: string;
    date: string;
}

interface UserStats {
    debates_won: number;
    debates_lost: number;
    debates_competed: number;
}

interface LeaderboardEntry {
    rank: number;
    username: string;
    elo: number;
    mind_tokens: number;
}

const Dashboard = () => {
    const { user, logout, token } = useAuth(); // Get token here
    const navigate = useNavigate();
    const [debates, setDebates] = useState<DebateHistory[]>([]);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [stats, setStats] = useState<UserStats | null>(null);
    const [badges, setBadges] = useState([]);
    const [streaks, setStreaks] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchDashboardData = async () => {
            // Use token from useAuth hook
            if (!user || !token) { 
                setIsLoading(false);
                return;
            }

            try {
                // Use token for authenticated requests
                const authHeader = { Authorization: `Bearer ${token}` };

                const [statsRes, historyRes, leaderboardRes, badgesRes, streaksRes] = await Promise.all([
                    fetch(`${API_BASE}/dashboard/stats`, { headers: authHeader }),
                    fetch(`${API_BASE}/dashboard/history`, { headers: authHeader }),
                    fetch(`${API_BASE}/leaderboard/`), // Assuming public
                    fetch(`${API_BASE}/gamification/badges`), // Assuming public
                    fetch(`${API_BASE}/gamification/streaks`, { headers: authHeader }),
                ]);

                if (!statsRes.ok || !historyRes.ok || !leaderboardRes.ok || !badgesRes.ok || !streaksRes.ok) {
                    console.error('API Failures:');
                    if (!statsRes.ok) console.error('Stats failed:', statsRes.status);
                    if (!historyRes.ok) console.error('History failed:', historyRes.status);
                    // ... (add checks for other responses if needed)
                    throw new Error('One or more API requests failed.');
                }

                const statsData = await statsRes.json();
                const historyData = await historyRes.json();
                const leaderboardData = await leaderboardRes.json();
                const badgesData = await badgesRes.json();
                const streaksData = await streaksRes.json();

                setStats(statsData);
                setDebates(historyData);
                setLeaderboard(leaderboardData.map((u: any, index: number) => ({ ...u, rank: index + 1 })));
                setBadges(badgesData);
                setStreaks(streaksData);

            } catch (error) {
                console.error('Failed to fetch dashboard data:', error);
                toast({
                    title: "Dashboard Load Error",
                    description: "Failed to fetch data. Please check connection.", // Simplified error
                    variant: "destructive"
                });
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, [user, token]); // Add token to dependency array

    const handleStartDebate = () => {
        navigate('/matchmaking');
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    if (isLoading || !stats) { // Show loading if isLoading or stats are not yet loaded
        return (
            <div className="min-h-screen bg-gradient-bg flex items-center justify-center">
                <div className="animate-pulse text-cyber-red">Loading neural interface...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-bg text-white"> {/* Added text-white for base color */}
            <header className="border-b border-border/50 bg-card/20 backdrop-blur-sm sticky top-0 z-50"> {/* Added sticky top */}
                <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                    
                    {/* --- CRITICAL UI FIX: Logo and Credit --- */}
                    <div className="flex flex-col items-start -space-y-1"> {/* Changed to flex-col */}
                        <div className="flex items-center space-x-3">
                            <Brain className="h-8 w-8 text-cyber-red" />
                            <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                                MindGrid
                            </h1>
                        </div>
                         {/* Added your name credit */}
                        <p className="text-xs text-muted-foreground opacity-75 pl-1" style={{marginTop: '1px'}}>Made by Adnan Ahmad</p>
                    </div>
                    {/* --- END CRITICAL UI FIX --- */}
                    
                    <div className="flex items-center space-x-4">
                        <Link to="/leaderboard">
                            <Button variant="ghost" className="text-muted-foreground hover:text-foreground">Leaderboard</Button> {/* Applied text colors */}
                        </Link>
                        <Link to="/forums">
                            <Button variant="ghost" className="text-muted-foreground hover:text-foreground">Forums</Button> {/* Applied text colors */}
                        </Link>
                        <div className="text-right">
                            <p className="text-sm text-muted-foreground">Welcome back,</p>
                            <p className="font-semibold text-foreground">{user?.username}</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground hover:text-cyber-red"> {/* Applied text colors */}
                            <LogOut className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </header>

            <div className="container mx-auto px-4 py-8">
                <div className="relative mb-8 rounded-2xl overflow-hidden shadow-cyber"> {/* Added shadow */}
                    <img 
                        src={heroImage} 
                        alt="MindGrid Arena" 
                        className="w-full h-64 object-cover"
                        onError={(e) => (e.currentTarget.src = 'https://placehold.co/1200x300/1a090a/E03A3E?text=MindGrid+Arena')} // Fallback
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/70 to-transparent flex items-center"> {/* Adjusted gradient */}
                        <div className="p-8 md:p-12"> {/* Added responsive padding */}
                            <h2 className="text-4xl font-bold text-foreground mb-2">
                                Ready for battle?
                            </h2>
                            <p className="text-lg text-muted-foreground mb-6"> {/* Added lg text size */}
                                Enter the neural arena and test your debating skills
                            </p>
                            <Button size="lg" onClick={handleStartDebate} className="bg-cyber-red hover:bg-cyber-red/80 text-white shadow-lg"> {/* Sized lg and styled */}
                                <Swords className="mr-2 h-5 w-5" />
                                Start Debate
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    {/* Stats Cards */}
                    <Card className="bg-gradient-card border-border/50 p-6">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-cyber-red/20 rounded-lg">
                                <Target className="h-6 w-6 text-cyber-red" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">ELO Rating</p>
                                <p className="text-2xl font-bold text-foreground">{user?.elo}</p>
                            </div>
                        </div>
                    </Card>
                    <Card className="bg-gradient-card border-border/50 p-6">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-cyber-gold/20 rounded-lg">
                                <Zap className="h-6 w-6 text-cyber-gold" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Mind Tokens</p>
                                <p className="text-2xl font-bold text-foreground">{user?.mind_tokens}</p>
                            </div>
                        </div>
                    </Card>
                    <Card className="bg-gradient-card border-border/50 p-6">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-cyber-green/20 rounded-lg">
                                <Trophy className="h-6 w-6 text-cyber-green" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Wins</p>
                                <p className="text-2xl font-bold text-foreground">
                                    {stats?.debates_won || 0}
                                </p>
                            </div>
                        </div>
                    </Card>
                    <Card className="bg-gradient-card border-border/50 p-6">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-cyber-blue/20 rounded-lg">
                                <TrendingUp className="h-6 w-6 text-cyber-blue" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Total Debates</p>
                                <p className="text-2xl font-bold text-foreground">{stats?.debates_competed || 0}</p>
                            </div>
                        </div>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Debate History */}
                    <Card className="bg-gradient-card border-border/50 p-6 lg:col-span-2">
                        <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center">
                            <Clock className="mr-2 h-5 w-5 text-cyber-blue" />
                            Recent Debates
                        </h3>
                        <div className="space-y-4">
                            {debates.length > 0 ? (
                                debates.map((debate) => (
                                    <div key={debate.id} className="border border-border/30 rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="font-medium text-foreground">{debate.topic}</p>
                                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                                debate.winner === user?.username ? 'bg-cyber-green/20 text-cyber-green' :
                                                debate.winner === 'draw' || debate.winner === 'Draw' ? 'bg-cyber-gold/20 text-cyber-gold' :
                                                'bg-cyber-red/20 text-cyber-red'
                                            }`}>
                                                {debate.winner === user?.username ? 'WIN' : debate.winner === 'draw' || debate.winner === 'Draw' ? 'DRAW' : 'LOSS'}
                                            </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground mb-1">
                                            vs {debate.opponent_username || 'AI'}
                                        </p>
                                    </div>
                                ))
                            ) : (
                                <p className="text-muted-foreground text-center">No recent debates found.</p>
                            )}
                        </div>
                    </Card>

                    {/* Leaderboard Preview */}
                    <Card className="bg-gradient-card border-border/50 p-6">
                        <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center">
                            <Trophy className="mr-2 h-5 w-5 text-cyber-gold" />
                            Leaderboard
                        </h3>
                        <div className="space-y-3">
                            {leaderboard.length > 0 ? (
                                leaderboard.slice(0, 5).map((entry) => ( // Show top 5
                                    <div
                                        key={entry.rank}
                                        className={`flex items-center justify-between p-3 rounded-lg ${
                                            entry.username === user?.username ? 'bg-cyber-red/10 border border-cyber-red/30' : 'bg-muted/20'
                                        }`}
                                    >
                                        <div className="flex items-center space-x-3">
                                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                                entry.rank === 1 ? 'bg-cyber-gold text-background' :
                                                entry.rank === 2 ? 'bg-gray-400 text-background' :
                                                entry.rank === 3 ? 'bg-amber-600 text-background' :
                                                'bg-muted text-muted-foreground'
                                            }`}>
                                                {entry.rank}
                                            </span>
                                            <span className="font-medium text-foreground">{entry.username}</span>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-foreground">{entry.elo} ELO</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-muted-foreground text-center">Leaderboard not available.</p>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;