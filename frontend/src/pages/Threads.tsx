import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

interface Thread {
  id: number;
  title: string;
}

const Threads = () => {
  const { forumId } = useParams();
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    fetch(`http://localhost:8000/forums/${forumId}/threads`)
      .then((res) => res.json())
      .then((data) => setThreads(data));
  }, [forumId]);

  return (
    <div className="min-h-screen bg-gradient-bg text-foreground p-8">
      <Card className="max-w-2xl mx-auto bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center">
            <MessageSquare className="mr-2" />
            Threads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {threads.map((thread) => (
              <Link to={`/threads/${thread.id}/posts`} key={thread.id}>
                <div className="p-4 rounded-lg bg-background/50 border border-border/30 hover:bg-background/70 transition-colors">
                  <p className="font-semibold">{thread.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Threads;
