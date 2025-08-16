import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Crown, Trophy } from 'lucide-react';

interface LeaderboardUser {
  id: string;
  username: string;
  elo: number;
}

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);

  useEffect(() => {
    fetch('http://localhost:8000/leaderboard/')
      .then((res) => res.json())
      .then((data) => setLeaderboard(data));
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
