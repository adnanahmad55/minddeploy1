import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { MessageSquare, Send } from 'lucide-react';

// ----------------------------------------------------
// *** FIX: Define API_BASE using Environment Variable ***
// ----------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Post {
    id: number;
    content: string;
    user: {
        username: string;
    };
}

const Posts = () => {
    const { threadId } = useParams();
    const { user } = useAuth();
    const [posts, setPosts] = useState<Post[]>([]);
    const [newPost, setNewPost] = useState('');

    const fetchPosts = () => {
        // --- FIX 1: Use API_BASE for Fetching Posts ---
        fetch(`${API_BASE}/threads/${threadId}/posts`)
            .then((res) => {
                 if (!res.ok) {
                    throw new Error(`Failed to fetch posts: ${res.status}`);
                 }
                 return res.json();
            })
            .then((data) => setPosts(data))
            .catch((error) => {
                console.error("Error fetching posts:", error);
                toast({
                    title: "Error loading posts",
                    description: "Could not retrieve forum posts.",
                    variant: "destructive",
                });
            });
    };

    useEffect(() => {
        fetchPosts();
    }, [threadId]);

    const handleCreatePost = async () => {
        if (!newPost.trim() || !user || !threadId) return;

        try {
            // --- FIX 2: Use API_BASE for Creating Post ---
            const response = await fetch(`${API_BASE}/posts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({
                    content: newPost,
                    thread_id: threadId,
                }),
            });

            if (response.ok) {
                setNewPost('');
                fetchPosts(); // Refresh the list
            } else {
                toast({
                    title: 'Failed to create post',
                    description: `Server responded with status: ${response.status}.`,
                    variant: 'destructive',
                });
            }
        } catch (error) {
            toast({
                title: 'An error occurred',
                description: 'Failed to send post due to network issue.',
                variant: 'destructive',
            });
        }
    };

    return (
        <div className="min-h-screen bg-gradient-bg text-foreground p-8">
            <Card className="max-w-2xl mx-auto bg-card/50 border-border/30">
                <CardHeader>
                    <CardTitle className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center">
                        <MessageSquare className="mr-2" />
                        Posts
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {posts.map((post) => (
                            <div key={post.id} className="p-4 rounded-lg bg-background/50 border border-border/30">
                                <p className="font-semibold">{post.user.username}</p>
                                <p className="text-sm text-muted-foreground">{post.content}</p>
                            </div>
                        ))}
                    </div>
                    {user && (
                        <div className="mt-4 flex space-x-2">
                            <Input
                                value={newPost}
                                onChange={(e) => setNewPost(e.target.value)}
                                placeholder="Write a reply..."
                                className="flex-1 bg-input/50 border-border/50 focus:border-cyber-red"
                            />
                            <Button onClick={handleCreatePost} disabled={!newPost.trim()}>
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                    {!user && (
                        <p className="text-muted-foreground text-center mt-4">Log in to post a reply.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Posts;
