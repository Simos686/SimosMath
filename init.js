// init.js - Initialisation globale de l'application
import { supabase } from './supabase-client.js';

class AppInitializer {
    constructor() {
        this.initialize();
    }

    async initialize() {
        // Vérifier l'authentification
        await this.checkAuth();
        
        // Initialiser les composants communs
        this.initCommonComponents();
        
        // Écouter les changements d'authentification
        this.setupAuthListener();
    }

    async checkAuth() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            
            // Stocker l'état d'authentification
            window.isAuthenticated = !!user;
            window.currentUser = user;
            
            // Mettre à jour l'interface
            this.updateAuthUI();
        } catch (error) {
            console.error('Erreur vérification auth:', error);
        }
    }

    updateAuthUI() {
        // Mettre à jour les boutons de connexion/déconnexion
        const authButtons = document.querySelectorAll('[data-auth-button]');
        
        authButtons.forEach(button => {
            if (window.isAuthenticated) {
                button.innerHTML = '<i class="fas fa-user mr-2"></i>Mon compte';
                button.onclick = () => window.location.href = 'dashboard.html';
            } else {
                button.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Connexion';
                button.onclick = () => window.location.href = 'auth.html';
            }
        });
    }

    initCommonComponents() {
        // Initialiser les tooltips
        this.initTooltips();
        
        // Initialiser les notifications
        this.initNotifications();
        
        // Initialiser les modals
        this.initModals();
    }

    setupAuthListener() {
        supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event);
            
            if (event === 'SIGNED_IN') {
                window.isAuthenticated = true;
                window.currentUser = session?.user;
            } else if (event === 'SIGNED_OUT') {
                window.isAuthenticated = false;
                window.currentUser = null;
            }
            
            this.updateAuthUI();
        });
    }

    initTooltips() {
        // Implémenter les tooltips si nécessaire
    }

    initNotifications() {
        // Implémenter le système de notifications
    }

    initModals() {
        // Implémenter le système de modals
    }
}

// Initialiser l'application
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new AppInitializer();
    window.app = app;
});