import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Brain, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        // Console में 404 एरर को लॉग करें
        console.error(
            "404 Error: User attempted to access non-existent route:",
            location.pathname
        );
    }, [location.pathname]);

    const handleReturn = () => {
        // Dashboard पर वापस भेजें
        navigate('/dashboard');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-bg text-foreground p-8">
            <div className="text-center bg-card/50 border border-border/50 p-10 rounded-xl shadow-cyber max-w-md w-full">
                <XCircle className="h-16 w-16 text-cyber-red mx-auto mb-4" />
                
                <h1 className="text-5xl font-extrabold mb-2 bg-gradient-primary bg-clip-text text-transparent">
                    404
                </h1>
                
                <h2 className="text-2xl font-semibold text-foreground mb-4">
                    Route Not Found
                </h2>
                
                <p className="text-lg text-muted-foreground mb-6">
                    The requested neural pathway does not exist.
                </p>
                
                <Button 
                    onClick={handleReturn} 
                    className="bg-cyber-blue hover:bg-cyber-blue/80"
                    size="lg"
                >
                    <Brain className="mr-2 h-4 w-4" />
                    Return to Dashboard
                </Button>
                
                <p className="text-xs mt-4 text-muted-foreground/70">
                    Path attempted: {location.pathname}
                </p>
            </div>
        </div>
    );
};

export default NotFound;
