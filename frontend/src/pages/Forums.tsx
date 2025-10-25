import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';
import { toast } from '@/hooks/use-toast'; // Added toast for error handling

// ----------------------------------------------------
// *** FIX: Define API_BASE using Environment Variable ***
// ----------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Forum {
    id: number;
    name: string;
    description: string;
}

const Forums = () => {
    const [forums, setForums] = useState<Forum[]>([]);

    useEffect(() => {
        const fetchForums = async () => {
            try {
                // --- FIX: Use API_BASE for Live Deployment ---
                const response = await fetch(`${API_BASE}/forums/`);

                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                const data = await response.json();
                setForums(data);

            } catch (error) {
                console.error("Error fetching forums:", error);
                toast({
                    title: "Connection Error",
                    description: "Failed to load forums data from the server.",
                    variant: "destructive"
                });
            }
        };

        fetchForums();
    }, []);

    return (
        <div className="min-h-screen bg-gradient-bg text-foreground p-8">
            <Card className="max-w-2xl mx-auto bg-card/50 border-border/30">
                <CardHeader>
                    <CardTitle className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center">
                        <MessageSquare className="mr-2" />
                        Forums
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {forums.map((forum) => (
                            <Link to={`/forums/${forum.id}/threads`} key={forum.id}>
                                <div className="p-4 rounded-lg bg-background/50 border border-border/30 hover:bg-background/70 transition-colors">
                                    <p className="font-semibold">{forum.name}</p>
                                    <p className="text-sm text-muted-foreground">{forum.description}</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default Forums;
