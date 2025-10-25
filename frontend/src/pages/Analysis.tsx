import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Helper function to convert markdown to HTML
// This is a simple implementation. For a real project, a library is better.
const renderMarkdown = (markdownText: string) => {
  let html = markdownText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br />'); // Convert newlines to HTML breaks
  return html;
};

const Analysis = () => {
  const { debateId } = useParams();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!debateId) {
      navigate('/dashboard');
      return;
    }
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast'; // Assuming you use a toast notification system

// ----------------------------------------------------
// *** FIX: Use VITE_API_URL and define API_BASE ***
// ----------------------------------------------------
// Live Deployment के लिए Environment Variable का उपयोग करें।
// Fallback के लिए localhost का उपयोग करें।
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Helper function to convert markdown to HTML
// (This remains unchanged from your original code)
const renderMarkdown = (markdownText: string) => {
    let html = markdownText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\n/g, '<br />');
    return html;
};

const Analysis = () => {
    const { debateId } = useParams();
    const navigate = useNavigate();
    const [analysis, setAnalysis] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!debateId) {
            navigate('/dashboard');
            return;
        }

        const fetchAnalysis = async () => {
            setIsLoading(true);
            try {
                // API_BASE का उपयोग अब LIVE BACKEND URL से डेटा फेच करेगा
                const response = await fetch(`${API_BASE}/analysis/${debateId}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    },
                });

                if (!response.ok) {
                    // अगर 401 Unauthorized है, तो यूजर को लॉगिन पर भेजें
                    if (response.status === 401) {
                        toast({
                            title: "Session Expired",
                            description: "Please log in again.",
                            variant: "destructive",
                        });
                        navigate('/login');
                        return;
                    }
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                const data = await response.json();
                setAnalysis(data.analysis);
            } catch (error) {
                console.error("Error fetching analysis:", error);
                setAnalysis("Failed to load analysis. Please try again later.");
                toast({
                    title: "Data Fetch Error",
                    description: "Could not connect to the backend analysis service.",
                    variant: "destructive",
                });
            } finally {
                setIsLoading(false);
            }
        };

        fetchAnalysis();
    }, [debateId, navigate]);

    return (
        <div className="min-h-screen bg-gradient-bg text-foreground p-8">
            <header className="border-b border-border/50 bg-card/20 backdrop-blur-sm">
                <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                    <Button variant="ghost" onClick={() => navigate(-1)}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                    </Button>
                </div>
            </header>
            <Card className="max-w-2xl mx-auto bg-card/50 border-border/30">
                <CardHeader>
                    <CardTitle className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center">
                        <Brain className="mr-2" />
                        Debate Analysis for ID: {debateId}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-8">
                            <div className="relative mx-auto w-10 h-10 mb-4">
                                <div className="absolute inset-0 border-2 border-cyber-blue/30 rounded-full"></div>
                                <div className="absolute inset-0 border-2 border-cyber-blue border-t-transparent rounded-full animate-spin"></div>
                            </div>
                            <p className="text-muted-foreground">Generating analysis...</p>
                        </div>
                    ) : (
                        // Use a div with dangerouslySetInnerHTML to render the markdown
                        <div 
                            className="prose dark:prose-invert"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(analysis) }} 
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Analysis;
    setIsLoading(true);
    fetch(`http://127.0.0.1:8000/analysis/${debateId}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setAnalysis(data.analysis);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching analysis:", error);
        setAnalysis("Failed to load analysis. Please try again later.");
        setIsLoading(false);
      });
  }, [debateId, navigate]);

  return (
    <div className="min-h-screen bg-gradient-bg text-foreground p-8">
      <header className="border-b border-border/50 bg-card/20 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
      </header>
      <Card className="max-w-2xl mx-auto bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center">
            <Brain className="mr-2" />
            Debate Analysis for ID: {debateId}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="relative mx-auto w-10 h-10 mb-4">
                <div className="absolute inset-0 border-2 border-cyber-blue/30 rounded-full"></div>
                <div className="absolute inset-0 border-2 border-cyber-blue border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-muted-foreground">Generating analysis...</p>
            </div>
          ) : (
            // Use a div with dangerouslySetInnerHTML to render the markdown
            <div 
              className="prose dark:prose-invert" // Use Tailwind's typography plugin for good defaults
              dangerouslySetInnerHTML={{ __html: renderMarkdown(analysis) }} 
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Analysis;