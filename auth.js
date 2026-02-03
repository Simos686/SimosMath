// auth.js - Logique d'authentification
import { supabase, signUp, signIn, signInWithGoogle } from './supabase-client.js';

class AuthManager {
    constructor() {
        this.initialize();
    }

    initialize() {
        this.setupEventListeners();
        this.checkRedirect();
    }

    setupEventListeners() {
        // Connexion
        const loginButton = document.getElementById('loginButton');
        if (loginButton) {
            loginButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        // Inscription
        const registerButton = document.getElementById('registerButton');
        if (registerButton) {
            registerButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleRegister();
            });
        }

        // Google Sign In
        const googleButton = document.getElementById('googleSignIn');
        if (googleButton) {
            googleButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleGoogleSignIn();
            });
        }

        // Tabs
        const loginTab = document.getElementById('loginTab');
        const registerTab = document.getElementById('registerTab');
        
        if (loginTab) {
            loginTab.addEventListener('click', () => this.switchToTab('login'));
        }
        
        if (registerTab) {
            registerTab.addEventListener('click', () => this.switchToTab('register'));
        }
    }

    async handleLogin() {
        try {
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            if (!email || !password) {
                this.showError('Veuillez remplir tous les champs');
                return;
            }

            this.showLoading('Connexion en cours...');

            const result = await signIn(email, password);

            if (result.success) {
                this.redirectAfterLogin();
            } else {
                this.showError(result.error);
            }

        } catch (error) {
            console.error('Erreur connexion:', error);
            this.showError('Erreur de connexion: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async handleRegister() {
        try {
            const firstName = document.getElementById('registerFirstName').value;
            const lastName = document.getElementById('registerLastName').value;
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;
            const confirmPassword = document.getElementById('registerConfirmPassword').value;
            const acceptTerms = document.getElementById('acceptTerms').checked;

            // Validation
            if (!firstName || !lastName || !email || !password || !confirmPassword) {
                this.showError('Veuillez remplir tous les champs');
                return;
            }

            if (password !== confirmPassword) {
                this.showError('Les mots de passe ne correspondent pas');
                return;
            }

            if (password.length < 8) {
                this.showError('Le mot de passe doit contenir au moins 8 caractères');
                return;
            }

            if (!acceptTerms) {
                this.showError('Veuillez accepter les conditions générales');
                return;
            }

            this.showLoading('Création du compte...');

            const result = await signUp(email, password, {
                firstName,
                lastName
            });

            if (result.success) {
                // Vérifier s'il y a une redirection planifiée
                const urlParams = new URLSearchParams(window.location.search);
                const redirect = urlParams.get('redirect');
                const plan = urlParams.get('plan');

                if (redirect === 'payment' && plan) {
                    // Rediriger vers la page de paiement
                    localStorage.setItem('selectedPlan', plan);
                    window.location.href = `payment.html?plan=${plan}&trial=true`;
                } else {
                    // Rediriger vers le dashboard
                    window.location.href = 'dashboard.html';
                }
            } else {
                this.showError(result.error);
            }

        } catch (error) {
            console.error('Erreur inscription:', error);
            this.showError('Erreur lors de l\'inscription: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async handleGoogleSignIn() {
        try {
            this.showLoading('Connexion avec Google...');
            const result = await signInWithGoogle();
            
            if (result.success && result.url) {
                window.location.href = result.url;
            } else {
                this.showError('Erreur lors de la connexion avec Google');
            }
        } catch (error) {
            console.error('Erreur Google Sign In:', error);
            this.showError('Erreur de connexion Google: ' + error.message);
        }
    }

    switchToTab(tab) {
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const loginTab = document.getElementById('loginTab');
        const registerTab = document.getElementById('registerTab');

        if (tab === 'login') {
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
            loginTab.classList.add('active');
            registerTab.classList.remove('active');
        } else {
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
            loginTab.classList.remove('active');
            registerTab.classList.add('active');
        }
    }

    checkRedirect() {
        // Vérifier s'il y a une redirection après authentification
        const urlParams = new URLSearchParams(window.location.search);
        const error = urlParams.get('error');
        const message = urlParams.get('message');

        if (error) {
            this.showError(decodeURIComponent(error));
        }

        if (message) {
            this.showSuccess(decodeURIComponent(message));
        }

        // Vérifier si l'utilisateur est déjà connecté
        this.checkExistingSession();
    }

    async checkExistingSession() {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
            // Utilisateur déjà connecté, rediriger
            this.redirectAfterLogin();
        }
    }

    redirectAfterLogin() {
        const urlParams = new URLSearchParams(window.location.search);
        const redirect = urlParams.get('redirect');
        const plan = urlParams.get('plan');

        if (redirect === 'payment' && plan) {
            window.location.href = `payment.html?plan=${plan}&trial=true`;
        } else {
            window.location.href = 'dashboard.html';
        }
    }

    showLoading(message = 'Chargement...') {
        // Créer ou afficher un overlay de chargement
        let loadingEl = document.getElementById('loading-overlay');
        
        if (!loadingEl) {
            loadingEl = document.createElement('div');
            loadingEl.id = 'loading-overlay';
            loadingEl.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
            loadingEl.innerHTML = `
                <div class="bg-white rounded-xl p-8 text-center">
                    <div class="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p class="text-gray-700 font-medium">${message}</p>
                </div>
            `;
            document.body.appendChild(loadingEl);
        } else {
            loadingEl.classList.remove('hidden');
        }
    }

    hideLoading() {
        const loadingEl = document.getElementById('loading-overlay');
        if (loadingEl) {
            loadingEl.remove();
        }
    }

    showError(message) {
        this.hideLoading();
        
        // Afficher une notification d'erreur
        const errorEl = document.createElement('div');
        errorEl.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fadeIn';
        errorEl.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-exclamation-circle mr-3"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(errorEl);
        
        setTimeout(() => {
            errorEl.classList.add('animate-fadeOut');
            setTimeout(() => errorEl.remove(), 300);
        }, 5000);
    }

    showSuccess(message) {
        // Afficher une notification de succès
        const successEl = document.createElement('div');
        successEl.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fadeIn';
        successEl.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-check-circle mr-3"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(successEl);
        
        setTimeout(() => {
            successEl.classList.add('animate-fadeOut');
            setTimeout(() => successEl.remove(), 300);
        }, 3000);
    }
}

// Initialiser l'authentification
let authManager;
document.addEventListener('DOMContentLoaded', () => {
    authManager = new AuthManager();
    window.authManager = authManager;
});
