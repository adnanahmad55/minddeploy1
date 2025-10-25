import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext'; // पाथ ऐलिअस का उपयोग किया जा रहा है
import { toast } from '@/hooks/use-toast';
import { Brain, Swords, Users, Zap, Clock, ArrowLeft, Bot } from 'lucide-react';
import io, { Socket } from 'socket.io-client';

// NOTE: VITE_API_URL should be the base URL, e.g., 'https://minddeploy1-production.up.railway.app'
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

    // --- CRITICAL FIX: Force Polling Transport for Stability in Cloud Environments (400 Error Fix) ---
    useEffect(() => {
        if (!socketRef.current && user) {
            
            socketRef.current = io(API_BASE, { 
                query: { userId: user.id },
                auth: { token: token },
                // --- ADDED THIS LINE: Forces connection via HTTP Long Polling ---
                transports: ['polling'],
                // ------------------------------------------------------------------
            });

            socketRef.current.on('match_found', (data) => {
                console.log('Match found:', data);
                stopSearching();
                toast({
                    title: "मैच मिल गया!", // Match Found!
                    description: `डिबेटिंग ${data.opponent.username} टॉपिक पर: ${data.topic}`, // Debating...
                });
                navigate('/debate', { state: { debateId: data.debate_id, opponent: data.opponent, topic: data.topic } });
            });

            socketRef.current.on('connect_error', (error) => {
                console.error("Socket Connection Error:", error);
                toast({
                    title: "कनेक्शन त्रुटि", // Connection Error
                    description: "मैचमेकिंग सर्वर से कनेक्ट नहीं हो सका।", // Failed to connect...
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
            // FIX: Corrected URL for AI (to /ai-debate/start) and Human (to /debate/start-human)
            const endpoint = isAI ? `${API_BASE}/ai-debate/start` : `${API_BASE}/debate/start-human`;
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                // Assuming TopicSchema is sent
                body: JSON.stringify({ 
                    topic: "Should AI be regulated heavily?" // Mock topic for testing the flow
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `Matchmaking failed with status ${response.status}`);
            }

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
                socketRef.current?.emit('join_matchmaking_queue', { userId: user.id, elo: user.elo });
            }

        } catch (error) {
            console.error("Matchmaking initiation failed:", error);
            toast({
                title: "मैचमेकिंग त्रुटि", // Matchmaking Error
                description: `खोज शुरू नहीं हो सकी: ${error instanceof Error ? error.message : "अज्ञात त्रुटि"}`, // Could not start search...
                variant: "destructive",
            });
            stopSearching();
        }
    };

    return (
        <div className="min-h-screen bg-gradient-bg flex items-center justify-center p-4">
            <div className="absolute top-4 left-4">
                <Button variant="ghost" onClick={() => navigate('/dashboard')}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> वापस
                </Button>
            </div>
            <Card className="max-w-md w-full bg-card/50 border-border/50 p-8 shadow-cyber">
                <CardHeader className="text-center border-b border-border/50 pb-4 mb-6">
                    <CardTitle className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center justify-center">
                        <Swords className="mr-3 h-7 w-7" /> न्यूरल मैचमेकिंग
                    </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                    <div className="text-center">
                        <p className="text-lg font-semibold text-foreground">
                            वर्तमान ELO: {user?.elo}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            माइंड टोकन: {user?.mind_tokens}
                        </p>
                    </div>

                    {!isSearching ? (
                        <div className="space-y-4">
                            <Button
                                size="lg"
                                className="w-full bg-cyber-red hover:bg-cyber-red/80"
                                onClick={() => startMatchmaking(false)}
                            >
                                <Users className="mr-2 h-5 w-5" /> मानव प्रतिद्वंद्वी से डिबेट करें
                            </Button>
                            <Button
                                size="lg"
                                variant="secondary"
                                className="w-full bg-cyber-blue hover:bg-cyber-blue/80"
                                onClick={() => startMatchmaking(true)}
                            >
                                <Bot className="mr-2 h-5 w-5" /> AI से डिबेट करें
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
                                प्रतिद्वंद्वी की खोज हो रही है...
                            </p>
                            <p className="text-sm text-muted-foreground">
                                विषय: {topic || 'विषय निर्धारित हो रहा है...'}
                            </p>
                            <p className="text-sm font-mono text-cyber-red flex items-center justify-center">
                                <Clock className="h-4 w-4 mr-1" /> बीता समय: {formatTime(searchTime)}
                            </p>
                            <Button variant="outline" onClick={stopSearching} className="w-full">
                                खोज रद्द करें
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Matchmaking;
