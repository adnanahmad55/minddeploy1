import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
    Brain,
    Send,
    Clock,
    Users,
    Bot,
    ArrowLeft,
    Shield,
    Sword
} from 'lucide-react';
import io, { Socket } from 'socket.io-client';

// ----------------------------------------------------
// *** FIX: Define API_BASE using Environment Variable ***
// ----------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Message {
    id: string;
    content: string;
    sender_id: number | null;
    sender_type: 'user' | 'ai';
    debate_id: number;
    timestamp: Date;
}

interface Opponent {
    id: string;
    username: string;
    elo: number;
    is_ai: boolean;
}

const Debate = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentMessage, setCurrentMessage] = useState('');
    const [timeLeft, setTimeLeft] = useState(900);
    const [isDebateActive, setIsDebateActive] = useState(true);
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const opponent: Opponent = location.state?.opponent || {
        id: '0',
        username: 'AI Bot',
        elo: 1200,
        is_ai: true
    };
    const topic: string = location.state?.topic || 'The role of AI in society';
    const debateId = typeof location.state?.debateId === 'number'
        ? location.state.debateId
        : parseInt(String(location.state?.debateId), 10);

    const socketRef = useRef<Socket | null>(null);
    const messagesRef = useRef(messages);
    const timeLeftRef = useRef(timeLeft);

    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

    useEffect(() => {
        if (isNaN(debateId) || !debateId || !user) {
            toast({ title: "Debate ID Missing", description: "Could not find a valid debate. Please start a new one.", variant: "destructive" });
            navigate('/matchmaking');
            return;
        }

        // --- FIX 1: Socket.IO Connection URL ---
        if (!socketRef.current) {
            console.log("Initializing new socket instance for Debate ID:", debateId, "User ID:", user.id);
            socketRef.current = io(API_BASE, { // <-- FIX: Changed to API_BASE
                query: {
                    debateId: debateId,
                    userId: parseInt(user.id, 10)
                }
            });

            socketRef.current.on('connect', () => {
                console.log('Connected to socket server');
                socketRef.current?.emit('join_debate_room', { debateId: debateId, userId: parseInt(user.id, 10) });
            });

            socketRef.current.on('new_message', (message: any) => {
                console.log('Received new message:', message);
                setMessages(prev => [...prev, {
                    ...message,
                    id: String(message.id),
                    sender_id: message.sender_id !== null ? Number(message.sender_id) : null,
                    timestamp: new Date(message.timestamp)
                }]);
            });

            socketRef.current.on('ai_typing', (data) => {
                if (data.debateId === debateId) {
                    setIsTyping(data.is_typing);
                }
            });

            socketRef.current.on('debate_ended', (data) => {
                console.log('Debate ended event received, but navigation is handled by the button click.');
            });
        }

        return () => {
            if (socketRef.current) {
                console.log("Cleaning up socket listeners and disconnecting.");
                socketRef.current.off('connect');
                socketRef.current.off('new_message');
                socketRef.current.off('ai_typing');
                socketRef.current.off('debate_ended');
                socketRef.current.emit('leave_debate_room', { debateId: debateId, userId: user ? parseInt(user.id, 10) : undefined });
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [debateId, user, navigate, opponent, topic]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    useEffect(() => {
        if (isNaN(debateId) || !debateId) return;

        const fetchInitialMessages = async () => {
            try {
                // --- FIX 2: API Fetch for Initial Messages ---
                const response = await fetch(`${API_BASE}/debate/${debateId}/messages`, { // <-- FIX: Changed to API_BASE
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, },
                });
                if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
                const data = await response.json();
                setMessages(data.map((m: any) => ({
                    ...m,
                    id: String(m.id),
                    sender_id: m.sender_id !== null ? Number(m.sender_id) : null,
                    timestamp: new Date(m.timestamp)
                })));
                console.log("Initial messages fetched:", data);
            } catch (error) {
                console.error("Error fetching initial messages:", error);
                toast({ title: "Error loading debate history", description: "Could not fetch previous messages for this debate.", variant: "destructive", });
            }
        };
        fetchInitialMessages();
    }, [debateId]);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    setIsDebateActive(false);
                    toast({ title: "Debate finished!", description: "Time's up! Calculating results...", });
                    clearInterval(timer);
                    socketRef.current?.emit('end_debate', { debate_id: debateId, current_messages: messagesRef.current });
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [debateId]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const sendMessage = async () => {
        if (!currentMessage.trim() || !isDebateActive || !user || isNaN(debateId) || !debateId || !socketRef.current) return;

        const messageData = {
            content: currentMessage,
            sender_type: 'user',
            sender_id: parseInt(String(user.id), 10)
        };

        const newMessage: Message = {
            id: Date.now().toString(),
            content: currentMessage,
            sender_type: 'user',
            sender_id: parseInt(String(user.id), 10),
            debate_id: debateId,
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, newMessage]);
        setCurrentMessage('');

        if (opponent.is_ai) {
            console.log("Sending message to AI debate endpoint...");
            try {
                // --- FIX 3: AI Debate Endpoint URL ---
                const response = await fetch(`${API_BASE}/ai-debate/${debateId}/${encodeURIComponent(topic)}`, { // <-- FIX: Changed to API_BASE
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    },
                    body: JSON.stringify(messageData),
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error("Error response from AI debate API:", response.status, errorText);
                    toast({
                        title: "Error",
                        description: `Failed to send message: ${response.status} ${errorText}`,
                        variant: "destructive",
                    });
                    setMessages(prev => prev.filter(msg => msg.id !== newMessage.id));
                    return;
                }
                
                const aiMessage = await response.json();
                setMessages(prev => [...prev, {
                    ...aiMessage,
                    id: String(aiMessage.id),
                    sender_id: aiMessage.sender_id !== null ? Number(aiMessage.sender_id) : null,
                    timestamp: new Date(aiMessage.timestamp),
                    sender_type: 'ai'
                }]);
            } catch (error) {
                console.error("Fetch error sending message to AI debate API:", error);
                toast({
                    title: "Network Error",
                    description: "Failed to send message due to network error.",
                    variant: "destructive",
                });
                setMessages(prev => prev.filter(msg => msg.id !== newMessage.id));
            }
        } else {
            console.log("Sending message to human opponent via socket...");
            socketRef.current?.emit('send_message_to_human', {
                debateId: debateId,
                senderId: parseInt(String(user.id), 10),
                content: currentMessage,
                senderType: 'user'
            });
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const endDebate = () => {
        setIsDebateActive(false);
        toast({ title: "Debate ended by user", description: "The debate has concluded.", });
        socketRef.current?.emit('end_debate', { debate_id: debateId, current_messages: messagesRef.current });
        
        // Navigation is handled immediately
        navigate('/Result', {
            state: {
                opponent,
                topic,
                messages: messagesRef.current,
                duration: 900 - timeLeftRef.current,
                winner: null, 
                debateId: debateId
            }
        });
    };

    const forfeit = () => {
        toast({
            title: "Debate forfeited",
            description: "You have left the debate arena.",
            variant: "destructive",
        });
        socketRef.current?.emit('forfeit_debate', { debate_id: debateId, user_id: user?.id ? parseInt(String(user.id), 10) : undefined });
        navigate('/dashboard');
    };

    return (
        <div className="min-h-screen bg-gradient-bg flex flex-col">
            <header className="border-b border-border/50 bg-card/20 backdrop-blur-sm">
                <div className="container mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        <Button variant="ghost" size="sm" onClick={forfeit}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back
                        </Button>

                        <div className="flex items-center space-x-3">
                            <Brain className="h-6 w-6 text-cyber-red" />
                            <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                                Neural Battle
                            </h1>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Clock className="h-4 w-4 text-cyber-gold" />
                            <span className={`font-mono text-lg ${timeLeft < 60 ? 'text-cyber-red' : 'text-cyber-gold'}`}>
                                {formatTime(timeLeft)}
                            </span>
                        </div>
                    </div>

                    <div className="mt-3 text-center">
                        <p className="text-sm text-muted-foreground">Debate Topic:</p>
                        <p className="text-lg font-semibold text-foreground">{topic}</p>
                    </div>
                </div>
            </header>

            <div className="border-b border-border/50 bg-muted/10">
                <div className="container mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-cyber-blue/20 rounded-lg">
                                <Shield className="h-5 w-5 text-cyber-blue" />
                            </div>
                            <div>
                                <p className="font-semibold text-foreground">{user?.username}</p>
                                <p className="text-sm text-muted-foreground">{user?.elo} ELO</p>
                            </div>
                        </div>

                        <div className="text-center">
                            <div className="text-2xl">⚔️</div>
                            <p className="text-xs text-muted-foreground">VS</p>
                        </div>

                        <div className="flex items-center space-x-3">
                            <div>
                                <p className="font-semibold text-foreground text-right">{opponent.username}</p>
                                <p className="text-sm text-muted-foreground text-right">{opponent.elo} ELO</p>
                            </div>
                            <div className={`p-2 rounded-lg ${opponent.is_ai ? 'bg-cyber-gold/20' : 'bg-cyber-red/20'}`}>
                                {opponent.is_ai ? (
                                    <Bot className="h-5 w-5 text-cyber-gold" />
                                ) : (
                                    <Sword className="h-5 w-5 text-cyber-red" />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-hidden">
                <div className="h-full flex flex-col container mx-auto px-4 py-4">
                    <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                        {messages.length === 0 && (
                            <div className="text-center py-12">
                                <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">
                                    The debate arena awaits your opening argument...
                                </p>
                            </div>
                        )}

                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={`flex ${message.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <Card className={`max-w-[70%] p-4 ${
                                    message.sender_type === 'user'
                                        ? 'bg-gradient-primary text-primary-foreground'
                                        : 'bg-gradient-card border-border/50'
                                }`}>
                                    <p className="text-sm leading-relaxed">{message.content}</p>
                                    <p className={`text-xs mt-2 opacity-70 ${
                                        message.sender_type === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                                    }`}>
                                        {new Date(message.timestamp).toLocaleTimeString()}
                                    </p>
                                </Card>
                            </div>
                        ))}

                        {isTyping && (
                            <div className="flex justify-start">
                                <Card className="bg-gradient-card border-border/50 p-4">
                                    <div className="flex space-x-1">
                                        <div className="w-2 h-2 bg-cyber-gold rounded-full animate-pulse"></div>
                                        <div className="w-2 h-2 bg-cyber-gold rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                                        <div className="w-2 h-2 bg-cyber-gold rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                                    </div>
                                </Card>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    <div className="border-t border-border/50 pt-4">
                        <div className="flex space-x-3">
                            <Input
                                value={currentMessage}
                                onChange={(e) => setCurrentMessage(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder={isDebateActive ? "Enter your argument..." : "Debate has ended"}
                                disabled={!isDebateActive}
                                className="flex-1 bg-input/50 border-border/50 focus:border-cyber-red"
                            />
                            <Button
                                onClick={sendMessage}
                                disabled={!currentMessage.trim() || !isDebateActive}
                                size="icon"
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>

                        {isDebateActive && (
                            <div className="flex justify-between items-center mt-3">
                                <p className="text-xs text-muted-foreground">
                                    Press Enter to send • Shift+Enter for new line
                                </p>
                                <Button variant="outline" size="sm" onClick={endDebate}>
                                    End Debate
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Debate;
