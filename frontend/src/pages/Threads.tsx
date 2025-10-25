import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// ----------------------------------------------------
// *** FIX: Define API_BASE using Environment Variable ***
// ----------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Thread {
    id: number;
    title: string;
    // Assuming these are also fetched from the backend for display
    post_count: number;
    last_post_user: string;
}

const Threads = () => {
    const { forumId } = useParams();
    const navigate = useNavigate();
    const [threads, setThreads] = useState<Thread[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchThreads = async () => {
            if (!forumId) return;

            setIsLoading(true);
            try {
                // --- FIX: Use API_BASE for Live Deployment ---
                const response = await fetch(`${API_BASE}/forums/${forumId}/threads`);
                
                if (!response.ok) {
                    toast({
                        title: "Error",
                        description: `Failed to load threads: Status ${response.status}`,
                        variant: "destructive",
                    });
                    throw new Error(`Failed to load threads: ${response.status}`);
                }

                const data = await response.json();
                setThreads(data);

            } catch (error) {
                console.error("Error fetching threads:", error);
                // Redirect back to forums list on major error
                navigate('/forums'); 
            } finally {
                setIsLoading(false);
            }
        };

        fetchThreads();
    }, [forumId, navigate]);

    return (
        <div className="min-h-screen bg-gradient-bg text-foreground p-8">
            <div className="max-w-2xl mx-auto mb-6 flex justify-between items-center">
                <Button variant="ghost" onClick={() => navigate('/forums')}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Forums
                </Button>
            </div>

            <Card className="max-w-2xl mx-auto bg-card/50 border-border/30">
                <CardHeader>
                    <CardTitle className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center">
                        <MessageSquare className="mr-2" />
                        Threads in Forum {forumId}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-6">
                            <Loader2 className="h-6 w-6 animate-spin text-cyber-blue mx-auto" />
                            <p className="text-muted-foreground mt-2">Loading threads...</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {threads.length === 0 ? (
                                <p className="text-center text-muted-foreground py-4">No threads found in this forum.</p>
                            ) : (
                                threads.map((thread) => (
                                    <Link to={`/threads/${thread.id}/posts`} key={thread.id}>
                                        <div className="p-4 rounded-lg bg-background/50 border border-border/30 hover:bg-background/70 transition-colors">
                                            <p className="font-semibold">{thread.title}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {thread.post_count || 0} Posts • Last reply by {thread.last_post_user || 'System'}
                                            </p>
                                        </div>
                                    </Link>
                                ))
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Threads;
