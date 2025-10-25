import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Brain, Lock, User } from 'lucide-react';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            // NOTE: The actual API call to /token is handled inside AuthContext.tsx
            await login(username, password); 
            toast({
                title: "Login successful",
                description: "Welcome to MindGrid!",
            });
            // Successful login redirects to dashboard
            navigate('/dashboard'); 
            
        } catch (error) {
            toast({
                title: "Login failed",
                description: "Invalid credentials. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-bg flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="flex items-center justify-center mb-4">
                        <Brain className="h-12 w-12 text-cyber-red mr-2" />
                        <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                            MindGrid
                        </h1>
                    </div>
                    <p className="text-muted-foreground">
                        Enter the neural battleground
                    </p>
                </div>

                <Card className="bg-gradient-card border-border/50 p-8 shadow-cyber">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Username</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="pl-10 bg-input/50 border-border/50 focus:border-cyber-red"
                                    placeholder="Enter your username"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-10 bg-input/50 border-border/50 focus:border-cyber-red"
                                    placeholder="Enter your password"
                                    required
                                />
                            </div>
                        </div>

                        <Button
                            type="submit"
                            size="lg"
                            className="w-full"
                            disabled={isLoading}
                        >
                            {isLoading ? "Connecting..." : "Enter the Grid"}
                        </Button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-muted-foreground">
                            New to MindGrid?{' '}
                            <Link 
                                to="/register" 
                                className="text-cyber-red hover:text-cyber-red/80 font-medium transition-colors"
                            >
                                Join the battle
                            </Link>
                        </p>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default Login;