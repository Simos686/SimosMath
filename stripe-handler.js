// stripe-handler.js
import { getConfig, initStripe } from './config.js';
import { supabase } from './supabase-client.js';

const config = getConfig();

// Initialiser Stripe
const stripe = initStripe();

// =================== GESTION DES PAIEMENTS ===================

/**
 * Créer une session de paiement pour un abonnement
 */
export async function createSubscriptionSession(plan, period, customerInfo) {
    try {
        // Récupérer l'utilisateur actuel
        const user = await supabase.auth.getUser();
        if (!user.data.user) {
            throw new Error('Utilisateur non authentifié');
        }

        // Appeler l'API backend
        const response = await fetch(`${config.API.BASE_URL}${config.API.ENDPOINTS.CREATE_SUBSCRIPTION}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.data.session.access_token}`
            },
            body: JSON.stringify({
                plan,
                period,
                customer: customerInfo,
                successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancelUrl: `${window.location.origin}/tarifs`
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erreur lors de la création de la session');
        }

        const { sessionId } = await response.json();
        
        // Rediriger vers Stripe Checkout
        const result = await stripe.redirectToCheckout({ sessionId });
        
        if (result.error) {
            throw result.error;
        }

    } catch (error) {
        console.error('Erreur création abonnement:', error);
        throw error;
    }
}

/**
 * Démarrer un essai gratuit
 */
export async function startFreeTrial(plan, customerInfo) {
    try {
        const user = await supabase.auth.getUser();
        if (!user.data.user) {
            throw new Error('Utilisateur non authentifié');
        }

        const response = await fetch(`${config.API.BASE_URL}/api/trial/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.data.session.access_token}`
            },
            body: JSON.stringify({
                plan,
                customer: customerInfo
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erreur lors du démarrage de l\'essai');
        }

        const result = await response.json();
        
        // Mettre à jour le profil utilisateur
        await supabase
            .from('profiles')
            .update({
                subscription_tier: plan,
                subscription_status: 'trial',
                trial_ends_at: result.trialEndsAt
            })
            .eq('id', user.data.user.id);

        return {
            success: true,
            trialEndsAt: result.trialEndsAt,
            message: 'Essai gratuit démarré avec succès!'
        };

    } catch (error) {
        console.error('Erreur démarrage essai:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Annuler un abonnement
 */
export async function cancelSubscription() {
    try {
        const user = await supabase.auth.getUser();
        if (!user.data.user) {
            throw new Error('Utilisateur non authentifié');
        }

        const response = await fetch(`${config.API.BASE_URL}${config.API.ENDPOINTS.CANCEL_SUBSCRIPTION}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.data.session.access_token}`
            },
            body: JSON.stringify({
                userId: user.data.user.id
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erreur lors de l\'annulation');
        }

        // Mettre à jour le profil utilisateur
        await supabase
            .from('profiles')
            .update({
                subscription_status: 'canceled'
            })
            .eq('id', user.data.user.id);

        return {
            success: true,
            message: 'Abonnement annulé avec succès'
        };

    } catch (error) {
        console.error('Erreur annulation abonnement:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Récupérer les détails d'un paiement
 */
export async function getPaymentDetails(sessionId) {
    try {
        const response = await fetch(`${config.API.BASE_URL}/api/payments/${sessionId}`, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Erreur lors de la récupération des détails');
        }

        return await response.json();

    } catch (error) {
        console.error('Erreur récupération détails:', error);
        return null;
    }
}

/**
 * Gérer le retour de paiement
 */
export async function handlePaymentReturn() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('session_id');
        
        if (!sessionId) return null;

        const paymentDetails = await getPaymentDetails(sessionId);
        
        if (paymentDetails && paymentDetails.status === 'succeeded') {
            // Mettre à jour le profil utilisateur
            const user = await supabase.auth.getUser();
            if (user.data.user) {
                await supabase
                    .from('profiles')
                    .update({
                        subscription_tier: paymentDetails.plan,
                        subscription_status: 'active'
                    })
                    .eq('id', user.data.user.id);
            }
        }

        return paymentDetails;

    } catch (error) {
        console.error('Erreur traitement retour paiement:', error);
        return null;
    }
}

// =================== UTILITAIRES STRIPE ===================

/**
 * Créer un élément de carte bancaire
 */
export function createCardElement(options = {}) {
    if (!stripe) return null;
    
    const elements = stripe.elements();
    const style = {
        base: {
            color: '#32325d',
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSmoothing: 'antialiased',
            fontSize: '16px',
            '::placeholder': {
                color: '#aab7c4'
            }
        },
        invalid: {
            color: '#fa755a',
            iconColor: '#fa755a'
        }
    };

    const card = elements.create('card', { 
        style: style,
        hidePostalCode: true,
        ...options 
    });
    
    return card;
}

/**
 * Valider les détails de la carte
 */
export async function validateCard(cardElement) {
    try {
        const { error, paymentMethod } = await stripe.createPaymentMethod({
            type: 'card',
            card: cardElement
        });

        if (error) {
            return {
                valid: false,
                error: error.message
            };
        }

        return {
            valid: true,
            paymentMethodId: paymentMethod.id
        };

    } catch (error) {
        return {
            valid: false,
            error: 'Erreur lors de la validation de la carte'
        };
    }
}

/**
 * Récupérer les produits Stripe
 */
export async function getStripeProducts() {
    try {
        const response = await fetch(`${config.API.BASE_URL}/api/stripe/products`, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Erreur lors de la récupération des produits');
        }

        return await response.json();

    } catch (error) {
        console.error('Erreur récupération produits:', error);
        return [];
    }
}

// =================== GESTION DES ABONNEMENTS ===================

/**
 * Mettre à jour la méthode de paiement
 */
export async function updatePaymentMethod(subscriptionId) {
    try {
        const user = await supabase.auth.getUser();
        if (!user.data.user) {
            throw new Error('Utilisateur non authentifié');
        }

        const response = await fetch(`${config.API.BASE_URL}/api/subscriptions/update-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.data.session.access_token}`
            },
            body: JSON.stringify({
                subscriptionId: subscriptionId
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erreur lors de la mise à jour');
        }

        const { setupIntent } = await response.json();
        
        // Rediriger vers Stripe pour mettre à jour la méthode de paiement
        const result = await stripe.confirmCardSetup(setupIntent.client_secret);
        
        if (result.error) {
            throw result.error;
        }

        return {
            success: true,
            message: 'Méthode de paiement mise à jour avec succès'
        };

    } catch (error) {
        console.error('Erreur mise à jour paiement:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Changer de formule d'abonnement
 */
export async function changeSubscriptionPlan(currentSubscriptionId, newPlan, newPeriod) {
    try {
        const user = await supabase.auth.getUser();
        if (!user.data.user) {
            throw new Error('Utilisateur non authentifié');
        }

        const response = await fetch(`${config.API.BASE_URL}/api/subscriptions/change-plan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.data.session.access_token}`
            },
            body: JSON.stringify({
                subscriptionId: currentSubscriptionId,
                newPlan,
                newPeriod
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erreur lors du changement de formule');
        }

        const result = await response.json();
        
        // Mettre à jour le profil utilisateur
        await supabase
            .from('profiles')
            .update({
                subscription_tier: newPlan
            })
            .eq('id', user.data.user.id);

        return {
            success: true,
            message: 'Formule changée avec succès',
            nextPayment: result.nextPayment
        };

    } catch (error) {
        console.error('Erreur changement formule:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Exporter les fonctions principales
export default {
    // Payment sessions
    createSubscriptionSession,
    startFreeTrial,
    cancelSubscription,
    
    // Payment handling
    getPaymentDetails,
    handlePaymentReturn,
    
    // Card elements
    createCardElement,
    validateCard,
    
    // Products
    getStripeProducts,
    
    // Subscription management
    updatePaymentMethod,
    changeSubscriptionPlan
};