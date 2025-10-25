import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Crown, Trophy } from 'lucide-react';
import { toast } from '@/hooks/use-toast'; // Added toast for error handling

// ----------------------------------------------------
// *** FIX: Define API_BASE using Environment Variable ***
// ----------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface LeaderboardUser {
    id: string;
    username: string;
    elo: number;
}

const Leaderboard = () => {
    const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                // --- FIX: Use API_BASE for Live Deployment ---
                const response = await fetch(`${API_BASE}/leaderboard/`);

                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                const data = await response.json();
                setLeaderboard(data);
                
            } catch (error) {
                console.error("Error fetching leaderboard:", error);
                toast({
                    title: "Connection Error",
                    description: "Failed to load leaderboard data from the server.",
                    variant: "destructive"
                });
            }
        };

        fetchLeaderboard();
    }, []);

    return (
        <div className="min-h-screen bg-gradient-bg text-foreground p-8">
            <Card className="max-w-2xl mx-auto bg-card/50 border-border/30">
                <CardHeader>
                    <CardTitle className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center">
                        <Trophy className="mr-2" />
                        Leaderboard
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {leaderboard.map((user, index) => (
                            <div
                                key={user.id}
                                className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-border/30"
                            >
                                <div className="flex items-center">
                                    {index === 0 && <Crown className="text-yellow-500 mr-2" />}
                                    {index === 1 && <Trophy className="text-gray-400 mr-2" />}
                                    {index === 2 && <Trophy className="text-yellow-700 mr-2" />}
                                    <p className="font-semibold">{user.username}</p>
                                </div>
                                <p className="text-sm text-muted-foreground">{user.elo} ELO</p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default Leaderboard;
