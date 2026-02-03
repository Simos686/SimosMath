// stripe-handler.js - Version GitHub Pages
import { supabase } from './supabase-client.js';

// =================== GESTION DES PAIEMENTS SIMPLIFIÉE ===================

/**
 * Créer une session de paiement pour un abonnement (SIMULATION)
 */
export async function createSubscriptionSession(plan, period, customerInfo) {
    try {
        console.log('🎯 Création abonnement simulée:', { plan, period });
        
        // Récupérer l'utilisateur actuel
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
            return {
                success: false,
                error: 'Utilisateur non authentifié'
            };
        }

        // SIMULATION : Créer un customer Stripe (fictif)
        const stripeCustomerId = `cus_sim_${Date.now()}_${user.id.substring(0, 8)}`;
        
        // SIMULATION : URL de redirection vers Stripe (fictive)
        const mockStripeUrl = `https://checkout.stripe.com/pay/cs_test_${Date.now()}`;
        
        // Enregistrer l'intention dans Supabase
        const { error: dbError } = await supabase
            .from('payment_intents')
            .insert({
                user_id: user.id,
                plan: plan,
                period: period,
                amount: getPlanPrice(plan, period),
                stripe_customer_id: stripeCustomerId,
                status: 'pending',
                created_at: new Date().toISOString()
            });

        if (dbError) {
            console.error('Erreur enregistrement intent:', dbError);
        }

        // Pour GitHub Pages, on ne peut pas rediriger vers un vrai checkout
        // On simule le succès et on met à jour le profil
        
        // Mettre à jour le profil comme "en attente de paiement"
        await supabase
            .from('profiles')
            .update({
                subscription_tier: plan,
                subscription_status: 'pending',
                stripe_customer_id: stripeCustomerId
            })
            .eq('id', user.id);

        return {
            success: true,
            sessionId: `sess_${Date.now()}`,
            url: 'payment-success.html?mode=simulation&plan=' + plan,
            message: '🎭 Mode simulation activé - Redirection vers la page de succès'
        };

    } catch (error) {
        console.error('Erreur création abonnement:', error);
        return {
            success: false,
            error: error.message || 'Erreur lors de la création de la session'
        };
    }
}

/**
 * Démarrer un essai gratuit (VRAI - fonctionne avec Supabase seul)
 */
export async function startFreeTrial(plan, customerInfo) {
    try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
            return {
                success: false,
                error: 'Utilisateur non authentifié'
            };
        }

        // Vérifier si déjà en essai ou abonné
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('subscription_status, trial_ends_at')
            .eq('id', user.id)
            .single();

        if (existingProfile?.subscription_status === 'trial' || 
            existingProfile?.subscription_status === 'active') {
            return {
                success: false,
                error: 'Vous avez déjà un essai ou abonnement actif'
            };
        }

        // Date de fin d'essai (7 jours)
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 7);

        // Mettre à jour le profil utilisateur
        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                subscription_tier: plan,
                subscription_status: 'trial',
                trial_ends_at: trialEndsAt.toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id);

        if (updateError) throw updateError;

        return {
            success: true,
            trialEndsAt: trialEndsAt.toISOString(),
            message: '✅ Essai gratuit démarré avec succès !'
        };

    } catch (error) {
        console.error('Erreur démarrage essai:', error);
        return {
            success: false,
            error: error.message || 'Erreur lors du démarrage de l\'essai'
        };
    }
}

/**
 * Annuler un abonnement (SIMULATION)
 */
export async function cancelSubscription() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return {
                success: false,
                error: 'Utilisateur non authentifié'
            };
        }

        // Mettre à jour le profil utilisateur
        const { error } = await supabase
            .from('profiles')
            .update({
                subscription_status: 'canceled',
                subscription_tier: null,
                canceled_at: new Date().toISOString()
            })
            .eq('id', user.id);

        if (error) throw error;

        return {
            success: true,
            message: 'Abonnement annulé avec succès (mode simulation)'
        };

    } catch (error) {
        console.error('Erreur annulation abonnement:', error);
        return {
            success: false,
            error: error.message || 'Erreur lors de l\'annulation'
        };
    }
}

// =================== FONCTIONS UTILITAIRES ===================

/**
 * Prix des formules (simulation)
 */
function getPlanPrice(plan, period) {
    const prices = {
        decouverte: { monthly: 799, yearly: 7990 },
        excellence: { monthly: 1499, yearly: 14990 },
        famille: { monthly: 2499, yearly: 24990 }
    };
    
    return prices[plan]?.[period] || 1499;
}

/**
 * Récupérer le statut d'abonnement de l'utilisateur
 */
export async function getSubscriptionStatus() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return null;
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('subscription_tier, subscription_status, trial_ends_at')
            .eq('id', user.id)
            .single();

        return profile;

    } catch (error) {
        console.error('Erreur récupération statut:', error);
        return null;
    }
}

/**
 * Vérifier si l'utilisateur est en période d'essai
 */
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

/**
 * Formater un prix pour l'affichage
 */
export function formatPrice(amount, currency = 'EUR') {
    try {
        const formatter = new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: currency
        });
        
        // Convertir les centimes en euros
        const amountInEuros = amount / 100;
        return formatter.format(amountInEuros);
    } catch (error) {
        console.error('Erreur formatage prix:', error);
        return `${amount / 100} €`;
    }
}

// =================== VERSION "BACKEND-LESS" COMPLÈTE ===================

/**
 * Gestionnaire de paiements sans backend
 */
class StripeHandlerFrontend {
    constructor() {
        this.initialized = false;
    }
    
    async initialize() {
        // Vérifier que Stripe.js est chargé depuis CDN
        if (typeof window.Stripe === 'undefined') {
            await this.loadStripeJS();
        }
        this.initialized = true;
    }
    
    async loadStripeJS() {
        return new Promise((resolve, reject) => {
            if (typeof window.Stripe !== 'undefined') {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://js.stripe.com/v3/';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Échec du chargement de Stripe.js'));
            document.head.appendChild(script);
        });
    }
    
    /**
     * Version avec Stripe Checkout (nécessite une clé publique)
     */
    async createCheckoutSession(plan, period) {
        // ⚠️ ATTENTION : Cette fonction nécessite une clé publique Stripe
        // mais ne fonctionnera pas sans backend pour créer la session
        
        const stripePublishableKey = 'pk_test_votreClePublique'; // ⚠️ À CHANGER
        
        if (!this.initialized) {
            await this.initialize();
        }
        
        const stripe = window.Stripe(stripePublishableKey);
        
        // SIMULATION : Création d'une session (ne fonctionnera pas sans backend)
        console.warn('⚠️ Cette fonction nécessite un backend API');
        
        // Alternative : Rediriger vers une page avec instructions
        window.location.href = 'payment-instructions.html?plan=' + plan;
        
        return {
            success: false,
            error: 'Fonctionnalité requiert un déploiement backend',
            instructions: 'Déployez api-server.js sur Railway/Render pour activer les paiements réels'
        };
    }
    
    /**
     * Obtenir les produits (simulation)
     */
    async getProducts() {
        return [
            {
                id: 'prod_sim_decouverte',
                name: 'Formule Découverte',
                description: 'Parfait pour débuter en mathématiques',
                price: {
                    id: 'price_sim_decouverte_monthly',
                    amount: 799,
                    currency: 'eur',
                    interval: 'month'
                }
            },
            {
                id: 'prod_sim_excellence',
                name: 'Formule Excellence',
                description: 'Accès complet à toutes les fonctionnalités',
                price: {
                    id: 'price_sim_excellence_monthly',
                    amount: 1499,
                    currency: 'eur',
                    interval: 'month'
                }
            },
            {
                id: 'prod_sim_famille',
                name: 'Formule Famille',
                description: 'Pour plusieurs enfants',
                price: {
                    id: 'price_sim_famille_monthly',
                    amount: 2499,
                    currency: 'eur',
                    interval: 'month'
                }
            }
        ];
    }
}

// =================== EXPORT DES FONCTIONS ===================

export default {
    // Payment sessions (frontend-only)
    createSubscriptionSession,
    startFreeTrial,
    cancelSubscription,
    
    // Subscription info
    getSubscriptionStatus,
    isUserInTrial,
    
    // Utilities
    formatPrice,
    
    // Handler class (optionnel)
    StripeHandlerFrontend
};
