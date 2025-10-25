// AuthContext.tsx - FINAL CORRECTED VERSION

import React, { createContext, useContext, useState, useEffect } from 'react';

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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // API_BASE को सीधे Railway Environment से पढ़ें
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    
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
                        logout(); // Token invalid or expired
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

        // FIX: Changed /login to /token as per FastAPI auth_routes.py
        const response = await fetch(`${API_BASE}/token`, { 
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
        // Registration endpoint is /register
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