// config.js - Configuration centrale

const CONFIG = {
    // Supabase Configuration
    SUPABASE: {
        URL: 'https://kgmtlwvqidhavehgsbwb.supabase.co',
        ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnbXRsd3ZxaWRoYXZlaGdzYndiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTkxODgsImV4cCI6MjA4NTYzNTE4OH0.cJzTWt50XhZmnLHJrWObE6emYORyr8n-pmMT7dCdvKU'
    },
    
    // Stripe Configuration
    STRIPE: {
        PUBLISHABLE_KEY: 'pk_test_votre_cle_publique',
        API_VERSION: '2023-10-16'
    },
    
    // Application Settings
    APP: {
        NAME: 'SimosMaths',
        VERSION: '1.0.0',
        SITE_URL: 'https://simosmaths.com',
        TRIAL_DAYS: 7,
        CURRENCY: 'eur',
        LOCALE: 'fr-FR'
    },
    
    // API Endpoints
    API: {
        BASE_URL: process.env.NODE_ENV === 'production' 
            ? 'https://api.simosmaths.com'  // Votre URL de production
            : 'http://localhost:3001',
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
        ENABLE_STRIPE: true,
        ENABLE_EMAIL_NOTIFICATIONS: true,
        ENABLE_GOOGLE_LOGIN: true,
        ENABLE_TRIAL: true
    }
};

// Fonction pour obtenir la configuration basée sur l'environnement
export function getConfig() {
    const isProduction = typeof window !== 'undefined' && 
                         window.location.hostname !== 'localhost';
    
    return {
        ...CONFIG,
        APP: {
            ...CONFIG.APP,
            SITE_URL: isProduction ? CONFIG.APP.SITE_URL : 'http://localhost:3000'
        },
        API: {
            ...CONFIG.API,
            BASE_URL: isProduction ? CONFIG.API.BASE_URL : 'http://localhost:3001'
        }
    };
}

// Fonction pour initialiser Stripe
export function initStripe() {
    if (typeof window !== 'undefined' && window.Stripe) {
        return window.Stripe(CONFIG.STRIPE.PUBLISHABLE_KEY, {
            apiVersion: CONFIG.STRIPE.API_VERSION,
            locale: CONFIG.APP.LOCALE
        });
    }
    return null;
}

// Fonction pour vérifier si l'utilisateur est en période d'essai
export function isUserInTrial(trialEndsAt) {
    if (!trialEndsAt) return false;
    const trialEnd = new Date(trialEndsAt);
    const now = new Date();
    return trialEnd > now;
}

// Fonction pour formater les prix
export function formatPrice(amount, currency = CONFIG.APP.CURRENCY) {
    return new Intl.NumberFormat(CONFIG.APP.LOCALE, {
        style: 'currency',
        currency: currency
    }).format(amount / 100);
}

export default CONFIG;