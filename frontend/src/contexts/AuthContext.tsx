// AuthContext.tsx - F I X E D  V E R S I O N

import React, { createContext, useContext, useState, useEffect } from 'react';

// --- START: Missing Interface Definitions (Previous Errors) ---
interface User {
    id: string;
    username: string;
    email: string;
    elo: number;
    mind_tokens: number;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, email: string, password: string) => Promise<void>;
    logout: () => void;
    isLoading: boolean;
}
// --- END: Missing Interface Definitions ---

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};


// --------------------------------------------------------------------------------
// *** CRITICAL FIX: API_BASE Moved INSIDE AuthProvider Function ***
// This resolves the VS Code error and ensures import.meta.env works correctly.
// --------------------------------------------------------------------------------
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // API_BASE को सीधे Railway Environment से पढ़ें (VITE_API_URL का उपयोग करके)
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    
    // ----------------------------------------------------
    // *** Fix for previous deletion: ***
    // [API_BASE यहाँ से हटा दिया गया है क्योंकि यह अब ग्लोबल है] - यह कमेंट हटा दिया गया है 
    // ----------------------------------------------------

    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            if (token) {
                try {
                    const response = await fetch(`${API_BASE}/users/me`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                        },
                    });

                    if (response.ok) {
                        const userData = await response.json();
                        setUser(userData);
                    } else {
                        logout(); // Token invalid
                    }
                } catch (error) {
                    console.error('Auth init failed', error);
                    logout();
                }
            }
            setIsLoading(false);
        };

        initAuth();
    }, [token]);

    const login = async (username: string, password: string) => {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        // API_BASE का उपयोग
        const response = await fetch(`${API_BASE}/login`, { 
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Login failed');
        }

        const data = await response.json();
        const newToken = data.access_token;

        localStorage.setItem('token', newToken);
        setToken(newToken);

        const userResponse = await fetch(`${API_BASE}/users/me`, {
            headers: {
                'Authorization': `Bearer ${newToken}`,
            },
        });

        if (!userResponse.ok) {
            throw new Error('Failed to fetch user after login');
        }

        const userData = await userResponse.json();
        setUser(userData);
    };

    const register = async (username: string, email: string, password: string) => {
        // API_BASE का उपयोग
        const response = await fetch(`${API_BASE}/register`, { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, email, password }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Registration failed');
        }

        // Auto login after registration
        await login(username, password);
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, register, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};