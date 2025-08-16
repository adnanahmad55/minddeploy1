import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { MessageSquare, Send } from 'lucide-react';

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
    fetch(`http://localhost:8000/threads/${threadId}/posts`)
      .then((res) => res.json())
      .then((data) => setPosts(data));
  };

  useEffect(() => {
    fetchPosts();
  }, [threadId]);

  const handleCreatePost = async () => {
    try {
      const response = await fetch('http://localhost:8000/posts', {
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
        fetchPosts();
      } else {
        toast({
          title: 'Failed to create post',
          description: 'Please try again later.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'An error occurred',
        description: 'Please try again later.',
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
          <div className="mt-4 flex space-x-2">
            <Input
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              placeholder="Write a reply..."
            />
            <Button onClick={handleCreatePost}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Posts;
