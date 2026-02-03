// config.js - Version SÉCURISÉE pour GitHub Pages
const CONFIG = {
    // Supabase Configuration - À COMPLÉTER AVEC VOS VRAIES CLÉS
    SUPABASE: {
        URL: 'https://kgmtlwvqidhavehgsbwb.supabase.co',
        ANON_KEY: 'INSÉREZ-VOTRE-CLÉ-ANON-ICI' // ⚠️ À REMPLACER
    },
    
    // Stripe Configuration
    STRIPE: {
        PUBLISHABLE_KEY: 'pk_test_votre_cle_publique', // ⚠️ À REMPLACER
        API_VERSION: '2023-10-16'
    },
    
    // Application Settings
    APP: {
        NAME: 'SimosMaths',
        VERSION: '1.0.0',
        SITE_URL: 'https://simosmaths.com', // Votre domaine
        TRIAL_DAYS: 7,
        CURRENCY: 'eur',
        LOCALE: 'fr-FR'
    },
    
    // API Endpoints - IMPORTANT : Votre API doit être déployée ailleurs
    API: {
        // URL de votre API déployée (Railway, Render, Heroku, etc.)
        BASE_URL: 'https://simosmaths-api.up.railway.app', // ⚠️ À REMPLACER
        ENDPOINTS: {
            CREATE_SUBSCRIPTION: '/api/subscriptions/create',
            CANCEL_SUBSCRIPTION: '/api/subscriptions/cancel',
            WEBHOOK: '/api/webhook',
            DASHBOARD_STATS: '/api/dashboard/stats',
            EXERCISE_DATA: '/api/exercises'
        }
    },
    
    // Feature Flags
    FEATURES: {
        ENABLE_STRIPE: true,  // Mettre à false si Stripe pas configuré
        ENABLE_EMAIL_NOTIFICATIONS: true,
        ENABLE_GOOGLE_LOGIN: true,
        ENABLE_TRIAL: true
    }
};

// Fonction pour obtenir la configuration
export function getConfig() {
    // Auto-détection de l'environnement
    const isLocalhost = typeof window !== 'undefined' && 
                       (window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1');
    
    const isGitHub = typeof window !== 'undefined' && 
                    window.location.hostname.includes('github.io');
    
    let apiBaseUrl = CONFIG.API.BASE_URL;
    
    if (isLocalhost) {
        // Développement local
        apiBaseUrl = 'http://localhost:3001';
    } else if (isGitHub) {
        // GitHub Pages
        apiBaseUrl = 'https://simosmaths-api.up.railway.app'; // Votre API déployée
    }
    
    return {
        ...CONFIG,
        API: {
            ...CONFIG.API,
            BASE_URL: apiBaseUrl
        }
    };
}

// Fonction pour initialiser Stripe
export function initStripe() {
    if (typeof window !== 'undefined' && window.Stripe && CONFIG.STRIPE.PUBLISHABLE_KEY) {
        try {
            return window.Stripe(CONFIG.STRIPE.PUBLISHABLE_KEY, {
                apiVersion: CONFIG.STRIPE.API_VERSION,
                locale: CONFIG.APP.LOCALE
            });
        } catch (error) {
            console.error('Erreur initialisation Stripe:', error);
            return null;
        }
    }
    return null;
}

// Fonction pour vérifier si l'utilisateur est en période d'essai
export function isUserInTrial(trialEndsAt) {
    if (!trialEndsAt) return false;
    try {
        const trialEnd = new Date(trialEndsAt);
        const now = new Date();
        return trialEnd > now;
    } catch (error) {
        console.error('Erreur vérification trial:', error);
        return false;
    }
}

// Fonction pour formater les prix
export function formatPrice(amount, currency = CONFIG.APP.CURRENCY) {
    try {
        return new Intl.NumberFormat(CONFIG.APP.LOCALE, {
            style: 'currency',
            currency: currency
        }).format(amount / 100);
    } catch (error) {
        console.error('Erreur formatage prix:', error);
        return `${amount / 100} €`;
    }
}

// Fonction utilitaire pour vérifier la configuration
export function validateConfig() {
    const config = getConfig();
    const errors = [];
    
    if (!config.SUPABASE.URL || config.SUPABASE.URL.includes('YOUR')) {
        errors.push('URL Supabase non configurée');
    }
    
    if (!config.SUPABASE.ANON_KEY || config.SUPABASE.ANON_KEY.includes('INSÉREZ')) {
        errors.push('Clé Supabase non configurée');
    }
    
    if (!config.API.BASE_URL || config.API.BASE_URL.includes('railway.app')) {
        errors.push('URL API non configurée (déployez votre API sur Railway/Render)');
    }
    
    if (errors.length > 0) {
        console.error('❌ Configuration incomplète:', errors);
        if (typeof window !== 'undefined') {
            // Afficher un message discret en production
            setTimeout(() => {
                console.warn('Veuillez configurer les variables dans config.js');
            }, 3000);
        }
        return false;
    }
    
    console.log('✅ Configuration validée');
    return true;
}

// Valider au chargement
if (typeof window !== 'undefined') {
    setTimeout(() => validateConfig(), 1000);
}

export default CONFIG;
