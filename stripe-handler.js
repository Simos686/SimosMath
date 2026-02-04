// public/stripe-handler.js - Version production
import { getConfig } from './config.js';
import { supabase } from './supabase-client.js';

const config = getConfig();

/**
 * Créer un vrai checkout Stripe
 */
export async function createCheckoutSession(plan, period, successUrl, cancelUrl) {
    try {
        // 1. Obtenir le token
        const { data: { session: authSession } } = await supabase.auth.getSession();
        
        if (!authSession?.access_token) {
            throw new Error('Non authentifié');
        }
        
        // 2. Appeler l'API Render
        const response = await fetch(`${config.API.BASE_URL}${config.API.ENDPOINTS.CREATE_CHECKOUT}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authSession.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                plan,
                period,
                success_url: successUrl || `${window.location.origin}/payment-success.html`,
                cancel_url: cancelUrl || `${window.location.origin}/tarifs.html`
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Erreur création checkout');
        }
        
        // 3. Rediriger vers Stripe
        if (result.url) {
            window.location.href = result.url;
            return { success: true, url: result.url };
        } else {
            throw new Error('URL de checkout non reçue');
        }
        
    } catch (error) {
        console.error('❌ Erreur checkout:', error);
        throw error;
    }
}

/**
 * Démarrer un essai gratuit
 */
export async function startFreeTrial(plan) {
    try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        
        if (!authSession?.access_token) {
            throw new Error('Non authentifié');
        }
        
        const response = await fetch(`${config.API.BASE_URL}${config.API.ENDPOINTS.START_TRIAL}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authSession.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ plan })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Erreur démarrage essai');
        }
        
        // Mettre à jour le profil localement
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
            await supabase
                .from('profiles')
                .update({
                    subscription_tier: plan,
                    subscription_status: 'trial',
                    trial_ends_at: result.trialEndsAt
                })
                .eq('id', user.id);
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Erreur essai:', error);
        throw error;
    }
}

/**
 * Vérifier l'état d'une session Stripe
 */
export async function checkPaymentStatus(sessionId) {
    try {
        const response = await fetch(`${config.API.BASE_URL}/api/check-payment/${sessionId}`);
        
        if (!response.ok) {
            return { status: 'unknown' };
        }
        
        return await response.json();
        
    } catch (error) {
        console.error('❌ Erreur vérification paiement:', error);
        return { status: 'error', error: error.message };
    }
}

// Export pour compatibilité
export async function createSubscriptionSession(plan, period, customerInfo) {
    return createCheckoutSession(plan, period);
}
