import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Zap, Loader2, Gift } from 'lucide-react'; // Added Gift and Loader2 icons

// ----------------------------------------------------
// *** FIX: Define API_BASE using Environment Variable ***
// ----------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const Redeem = () => {
    const { user, token } = useAuth();
    const [isLoading, setIsLoading] = useState(false);

    const handleRedeem = async () => {
        if (!user || !token) {
            toast({ title: "Error", description: "You must be logged in to redeem tokens.", variant: "destructive" });
            return;
        }

        setIsLoading(true);

        try {
            // --- FIX: Use API_BASE for Live Deployment ---
            const response = await fetch(`${API_BASE}/tokens/redeem`, { 
                method: 'POST',
                headers: {
                    // JWT token sent with every request
                    'Authorization': `Bearer ${token}`, 
                },
                // Assuming no specific body is needed, or the body is handled by the server
            });

            const data = await response.json(); // Read response data

            if (response.ok) {
                toast({
                    title: 'Redemption Successful!',
                    description: data.message || 'You have successfully redeemed tokens.',
                });
                // NOTE: A function to refresh user context should ideally be called here
            } else {
                // Use data.detail if available, otherwise show a generic error
                toast({
                    title: 'Redemption Failed',
                    description: data.detail || 'Failed to redeem tokens. Server check required.',
                    variant: 'destructive',
                });
            }
        } catch (error) {
            console.error("Redeem network error:", error);
            toast({
                title: 'Network Error',
                description: 'Could not connect to the token service.',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-bg text-foreground p-8">
            <Card className="max-w-md mx-auto bg-card/50 border-border/30">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center justify-center">
                        <Gift className="mr-2" /> 
                        Redeem Tokens
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">Current Tokens: {user?.mind_tokens || 0}</p>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <p className="text-muted-foreground text-center">Click below to redeem your daily reward or use a code.</p>
                        <Button 
                            onClick={handleRedeem} 
                            disabled={isLoading || !user} 
                            className="w-full bg-cyber-gold hover:bg-cyber-gold/80"
                            size="lg"
                        >
                            {isLoading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Zap className="mr-2 h-4 w-4" />
                            )}
                            {isLoading ? 'Redeeming...' : 'Redeem 10 Tokens'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default Redeem;
