import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
  Brain,
  Trophy,
  Target,
  Zap,
  TrendingUp,
  RotateCcw,
  Home,
  Star,
  MessageCircle
} from 'lucide-react';

interface Message {
  id: string;
  content: string;
  sender_type: 'user' | 'ai';
  timestamp: Date;
}

interface Opponent {
  id: string;
  username: string;
  elo: number;
  is_ai: boolean;
}

interface DebateResult {
  score: number;
  result: 'win' | 'loss' | 'draw' | null;
  eloChange: number;
  tokensEarned: number;
  feedback: {
    logic: number;
    persuasion: number;
    evidence: number;
    style: number;
  };
  overallAnalysisText: string;
}

// Helper function to convert markdown to HTML
const renderMarkdown = (markdownText: string) => {
  let html = markdownText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br />'); // Convert newlines to HTML breaks
  return html;
};

const Result = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [result, setResult] = useState<DebateResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);

  const opponent: Opponent = location.state?.opponent || { id: '0', username: 'Unknown', elo: 1200, is_ai: true };
  const topic: string = location.state?.topic || 'Unknown topic';
  const messages: Message[] = location.state?.messages || [];
  const duration: number = location.state?.duration || 0;
  const debateId: number = location.state?.debateId;
  const winnerName: string | null = location.state?.winner || null;

  useEffect(() => {
    if (isNaN(debateId) || !debateId) {
      toast({
        title: "Debate Data Missing",
        description: "Could not load debate results. Please start a new debate.",
        variant: "destructive",
      });
      navigate('/dashboard');
      return;
    }

    const calculateSimulatedResults = (serverWinner: string | null) => {
      let simulatedResult: 'win' | 'loss' | 'draw' | null = null;
      if (serverWinner === user?.username) {
        simulatedResult = 'win';
      } else if (serverWinner === 'Draw') {
        simulatedResult = 'draw';
      } else if (serverWinner !== null && serverWinner !== user?.username) {
        simulatedResult = 'loss';
      }

      const userMessages = messages.filter(m => m.sender_type === 'user');
      const baseScore = Math.min(50 + userMessages.length * 5, 100);
      const scoreVariation = Math.random() * 20 - 10;
      const finalScore = Math.max(20, Math.min(100, baseScore + scoreVariation));
      const eloChange = simulatedResult === 'win' ? 10 : (simulatedResult === 'loss' ? -10 : 0);
      const tokensEarned = simulatedResult === 'win' ? 50 : (simulatedResult === 'loss' ? 10 : 25);

      return {
        score: Math.round(finalScore),
        result: simulatedResult,
        eloChange,
        tokensEarned,
        feedback: {
          logic: Math.floor(finalScore * 0.8 + Math.random() * 20),
          persuasion: Math.floor(finalScore * 0.9 + Math.random() * 20),
          evidence: Math.floor(finalScore * 0.7 + Math.random() * 30),
          style: Math.floor(finalScore * 0.85 + Math.random() * 20),
        },
        overallAnalysisText: '',
      };
    };

    const initialSimulatedResult = calculateSimulatedResults(winnerName);
    setResult(initialSimulatedResult);
    setIsLoading(false);

    const fetchAnalysis = async () => {
      setIsAnalysisLoading(true);
      try {
        const response = await fetch(`http://127.0.0.1:8000/analysis/${debateId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setResult(prevResult => ({
          ...prevResult!,
          overallAnalysisText: data.analysis,
        }));
        toast({
          title: "AI Analysis loaded!",
          description: "Detailed feedback is now available.",
        });
      } catch (error) {
        console.error("Error fetching AI analysis:", error);
        setResult(prevResult => ({
          ...prevResult!,
          overallAnalysisText: "Failed to load detailed AI analysis. Please try again later.",
        }));
        toast({
          title: "Analysis Error",
          description: "Could not load AI's detailed debate analysis.",
          variant: "destructive",
        });
      } finally {
        setIsAnalysisLoading(false);
      }
    };

    fetchAnalysis();
  }, [messages, debateId, navigate, winnerName, user]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getResultColor = (resultValue: string | null) => {
    if (!resultValue) return 'text-foreground';
    switch (resultValue.toLowerCase()) {
      case 'win': return 'text-cyber-green';
      case 'loss': return 'text-cyber-red';
      case 'draw': return 'text-cyber-gold';
      default: return 'text-foreground';
    }
  };

  const getResultIcon = (resultValue: string | null) => {
    if (!resultValue) return <Brain className="h-8 w-8" />;
    switch (resultValue.toLowerCase()) {
      case 'win': return <Trophy className="h-8 w-8" />;
      case 'loss': return <Target className="h-8 w-8" />;
      case 'draw': return <Star className="h-8 w-8" />;
      default: return <Brain className="h-8 w-8" />;
    }
  };

  if (isLoading || !result) {
    return (
      <div className="min-h-screen bg-gradient-bg flex items-center justify-center">
        <Card className="bg-gradient-card border-border/50 p-8 text-center max-w-md">
          <div className="relative mx-auto w-16 h-16 mb-6">
            <div className="absolute inset-0 border-4 border-cyber-blue/30 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-cyber-blue border-t-transparent rounded-full animate-spin"></div>
            <Brain className="absolute inset-0 m-auto h-8 w-8 text-cyber-blue" />
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-2">
            Calculating Debate Scores
          </h2>
          <p className="text-muted-foreground">
            Analyzing performance metrics...
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-bg">
      <header className="border-b border-border/50 bg-card/20 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Brain className="h-8 w-8 text-cyber-red" />
            <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              MindGrid
            </h1>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="ghost" onClick={() => navigate('/dashboard')}>
              <Home className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-gradient-card border-border/50 p-8 text-center mb-8">
            <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6 ${
              getResultColor(result.result)
            }`}>
              <div className={getResultColor(result.result)}>
                {getResultIcon(result.result)}
              </div>
            </div>

            <h2 className={`text-4xl font-bold mb-2 ${getResultColor(result.result)}`}>
              {result.result ? result.result.charAt(0).toUpperCase() + result.result.slice(1) : 'Undetermined'}!
            </h2>
            <p className="text-muted-foreground mb-4">
              Battle complete • {formatDuration(duration)} duration
            </p>
            <p className="text-xl font-semibold text-foreground">
              Final Score: {result.score}/100
            </p>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card className="bg-gradient-card border-border/50 p-6">
                <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center">
                  <TrendingUp className="mr-2 h-5 w-5 text-cyber-blue" />
                  Performance Breakdown
                </h3>
                <div className="space-y-4">
                  {[
                    { label: 'Logic & Reasoning', score: result.feedback.logic, color: 'cyber-red' },
                    { label: 'Persuasion', score: result.feedback.persuasion, color: 'cyber-blue' },
                    { label: 'Evidence Quality', score: result.feedback.evidence, color: 'cyber-green' },
                    { label: 'Style & Clarity', score: result.feedback.style, color: 'cyber-gold' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{item.label}</span>
                      <div className="flex items-center space-x-3">
                        <div className="w-32 bg-muted/30 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full bg-${item.color}`}
                            style={{ width: `${item.score}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-foreground w-10 text-right">
                          {item.score}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="bg-gradient-card border-border/50 p-6">
                <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center">
                  <MessageCircle className="mr-2 h-5 w-5 text-cyber-gold" />
                  AI Analysis
                </h3>
                {isAnalysisLoading ? (
                  <div className="text-center py-4">
                    <div className="relative mx-auto w-8 h-8 mb-2">
                      <div className="absolute inset-0 border-2 border-cyber-blue/30 rounded-full"></div>
                      <div className="absolute inset-0 border-2 border-cyber-blue border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <p className="text-muted-foreground text-sm">Generating detailed analysis...</p>
                  </div>
                ) : (
                  <div
                    className="prose dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(result.overallAnalysisText) }}
                  />
                )}
              </Card>

              <Card className="bg-gradient-card border-border/50 p-6">
                <h3 className="text-xl font-semibold text-foreground mb-4">
                  Debate Summary
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Topic</p>
                    <p className="text-foreground font-medium">{topic}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Opponent</p>
                    <p className="text-foreground font-medium">
                      {opponent.username} {opponent.is_ai && '(AI)'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Duration</p>
                    <p className="text-foreground font-medium">{formatDuration(duration)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Messages</p>
                    <p className="text-foreground font-medium">
                      {messages.filter(m => m.sender_type === 'user').length}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="bg-gradient-card border-border/50 p-6">
                <h3 className="text-xl font-semibold text-foreground mb-4">
                  Rewards Earned
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-cyber-red/20 rounded-lg">
                        <Target className="h-5 w-5 text-cyber-red" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">ELO Change</p>
                        <p className={`font-semibold ${result.eloChange >= 0 ? 'text-cyber-green' : 'text-cyber-red'}`}>
                          {result.eloChange >= 0 ? '+' : ''}{result.eloChange}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-cyber-gold/20 rounded-lg">
                        <Zap className="h-5 w-5 text-cyber-gold" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Mind Tokens</p>
                        <p className="font-semibold text-cyber-gold">
                          +{result.tokensEarned}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              <div className="space-y-3">
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => navigate('/matchmaking')}
                >
                  <RotateCcw className="mr-2 h-5 w-5" />
                  Battle Again
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={() => navigate('/dashboard')}
                >
                  <Home className="mr-2 h-5 w-5" />
                  Return to Base
                </Button>
                <Link to={`/analysis/${debateId}`} className="w-full">
                  <Button variant="secondary" size="lg" className="w-full">
                    <Brain className="mr-2 h-5 w-5" />
                    View Analysis
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Result;