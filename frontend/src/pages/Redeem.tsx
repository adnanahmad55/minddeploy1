import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Zap } from 'lucide-react';

const Redeem = () => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleRedeem = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/tokens/redeem', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (response.ok) {
        toast({
          title: 'Tokens redeemed',
          description: 'You have successfully redeemed 10 tokens.',
        });
      } else {
        toast({
          title: 'Failed to redeem tokens',
          description: 'You may not have enough tokens.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'An error occurred',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-bg text-foreground p-8">
      <Card className="max-w-2xl mx-auto bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center">
            <Zap className="mr-2" />
            Redeem Tokens
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p>You have {user?.mind_tokens} tokens.</p>
            <Button onClick={handleRedeem} disabled={isLoading}>
              {isLoading ? 'Redeeming...' : 'Redeem 10 Tokens'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Redeem;
