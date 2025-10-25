import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext'; // Path alias used
import { toast } from '@/hooks/use-toast';
import { Brain, Swords, Users, Zap, Clock, ArrowLeft, Bot } from 'lucide-react';
import io, { Socket } from 'socket.io-client';

// NOTE: VITE_API_URL should be the base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Opponent {
    id: string;
    username: string;
    elo: number;
    is_ai: boolean;
}

const Matchmaking = () => {
    const { user, token } = useAuth();
    const navigate = useNavigate();
    const [isSearching, setIsSearching] = useState(false);
    const [searchTime, setSearchTime] = useState(0);
    const [topic, setTopic] = useState<string>('');
    const socketRef = useRef<Socket | null>(null);
    const timerRef = useRef<number | null>(null);

    // --- CRITICAL FIX: Socket.IO Connection Setup ---
    useEffect(() => {
        if (!socketRef.current && user) {
            
            socketRef.current = io(API_BASE, { 
                query: { userId: user.id },
                auth: { token: token },
                // FIX: Forces connection via HTTP Long Polling to bypass Railway WSS proxy issues
                transports: ['polling'],
            });

            socketRef.current.on('match_found', (data) => {
                console.log('Match found:', data);
                stopSearching();
                toast({
                    title: "Match Found!",
                    description: `Debating ${data.opponent.username} on: ${data.topic}`,
                });
                navigate('/debate', { state: { debateId: data.debate_id, opponent: data.opponent, topic: data.topic } });
            });

            socketRef.current.on('connect_error', (error) => {
                console.error("Socket Connection Error:", error);
                toast({
                    title: "Connection Error",
                    description: "Failed to connect to matchmaking server.",
                    variant: "destructive",
                });
                stopSearching();
            });
            
            socketRef.current.on('connect', () => {
                console.log("Socket.IO connected successfully using Polling.");
                if (user) {
                    // Emit user_online to register in matchmaking.py
                    socketRef.current?.emit('user_online', { 
                        userId: user.id, 
                        username: user.username, 
                        elo: user.elo 
                    });
                }
            });
        }

        return () => {
            if (socketRef.current) {
                socketRef.current.emit('user_offline', { userId: user?.id });
                socketRef.current.emit('cancel_matchmaking', { userId: user?.id });
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [user, token, navigate]);

    // Timer logic (Unchanged)
    useEffect(() => {
        if (isSearching) {
            timerRef.current = setInterval(() => {
                setSearchTime(prev => prev + 1);
            }, 1000) as unknown as number;
        } else if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [isSearching]);

    const stopSearching = () => {
        setIsSearching(false);
        setSearchTime(0);
        if (socketRef.current) {
            socketRef.current.emit('cancel_matchmaking', { userId: user?.id });
        }
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const startMatchmaking = async (isAI: boolean) => {
        if (!user || isSearching) return;

        setIsSearching(true);
        setSearchTime(0);
        
        try {
            // Corrected URL for AI and Human
            const endpoint = isAI ? `${API_BASE}/ai-debate/start` : `${API_BASE}/debate/start-human`;
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ 
                    topic: "Should AI be regulated heavily?" // Mock topic 
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `Matchmaking failed with status ${response.status}`);
            }

            // Get data including the newly created debate ID
            const data = await response.json(); 
            setTopic(data.topic); 

            if (isAI) {
                // For AI matches, navigate immediately after creation
                stopSearching();
                navigate('/debate', { 
                    state: { 
                        debateId: data.id, 
                        opponent: { id: '1', username: 'AI Bot', elo: 1200, is_ai: true }, 
                        topic: data.topic 
                    } 
                });
            } else {
                // For human matches, wait for socket event
                // CRITICAL FIX: Send the debate ID received from the API call
                socketRef.current?.emit('join_matchmaking_queue', { 
                    userId: user.id, 
                    elo: user.elo,
                    debateId: data.id // <--- THIS IS THE FIX
                }); 
            }

        } catch (error) {
            console.error("Matchmaking initiation failed:", error);
            toast({
                title: "Matchmaking Error",
                description: `Could not start search: ${error instanceof Error ? error.message : "Unknown error"}`,
                variant: "destructive",
            });
            stopSearching();
        }
    };

    return (
        <div className="min-h-screen bg-gradient-bg flex items-center justify-center p-4">
            <div className="absolute top-4 left-4">
                <Button variant="ghost" onClick={() => navigate('/dashboard')}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
            </div>
            <Card className="max-w-md w-full bg-card/50 border-border/50 p-8 shadow-cyber">
                <CardHeader className="text-center border-b border-border/50 pb-4 mb-6">
                    <CardTitle className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center justify-center">
                        <Swords className="mr-3 h-7 w-7" /> Neural Matchmaking
                    </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                    <div className="text-center">
                        <p className="text-lg font-semibold text-foreground">
                            Current ELO: {user?.elo}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Mind Tokens: {user?.mind_tokens}
                        </p>
                    </div>

                    {!isSearching ? (
                        <div className="space-y-4">
                            <Button
                                size="lg"
                                className="w-full bg-cyber-red hover:bg-cyber-red/80"
                                onClick={() => startMatchmaking(false)}
                            >
                                <Users className="mr-2 h-5 w-5" /> Debate a Human Opponent
                            </Button>
                            <Button
                                size="lg"
                                variant="secondary"
                                className="w-full bg-cyber-blue hover:bg-cyber-blue/80"
                                onClick={() => startMatchmaking(true)}
                            >
                                <Bot className="mr-2 h-5 w-5" /> Debate the AI
                            </Button>
                        </div>
                    ) : (
                        <div className="text-center space-y-4">
                            <div className="relative w-20 h-20 mx-auto">
                                <div className="absolute inset-0 border-4 border-cyber-gold/30 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-cyber-gold border-t-transparent rounded-full animate-spin"></div>
                                <div className="absolute inset-0 flex items-center justify-center text-cyber-gold">
                                    <Swords className="h-10 w-10 animate-pulse" />
                                </div>
                            </div>
                            <p className="text-lg font-semibold text-foreground">
                                Searching for Opponent...
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Topic: {topic || 'Determining topic...'}
                            </p>
                            <p className="text-sm font-mono text-cyber-red flex items-center justify-center">
                                <Clock className="h-4 w-4 mr-1" /> Elapsed: {formatTime(searchTime)}
                            </p>
                            <Button variant="outline" onClick={stopSearching} className="w-full">
                                Cancel Search
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Matchmaking;