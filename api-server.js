// api-server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Charger les variables d'environnement
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Clients
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const stripe = new Stripe(STRIPE_SECRET_KEY);

// =================== MIDDLEWARE D'AUTHENTIFICATION ===================

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }

    try {
        // Vérifier le token avec Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
            return res.status(401).json({ error: 'Token invalide' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Erreur authentification:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
}

// =================== ROUTES ABONNEMENTS ===================

/**
 * Créer une session de paiement Stripe
 */
app.post('/api/subscriptions/create', authenticateToken, async (req, res) => {
    try {
        const { plan, period, customer, successUrl, cancelUrl } = req.body;
        const userId = req.user.id;

        // Vérifier si l'utilisateur existe dans Supabase
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (!profile) {
            return res.status(404).json({ error: 'Profil utilisateur non trouvé' });
        }

        // Récupérer ou créer un client Stripe
        let stripeCustomerId = null;
        
        if (profile.stripe_customer_id) {
            stripeCustomerId = profile.stripe_customer_id;
        } else {
            const customer = await stripe.customers.create({
                email: profile.email,
                name: `${profile.first_name} ${profile.last_name}`,
                metadata: {
                    userId: userId,
                    plan: plan
                }
            });
            stripeCustomerId = customer.id;

            // Mettre à jour le profil avec l'ID Stripe
            await supabase
                .from('profiles')
                .update({ stripe_customer_id: customer.id })
                .eq('id', userId);
        }

        // ID des prix Stripe (à configurer dans votre dashboard Stripe)
        const priceIds = {
            decouverte_monthly: process.env.STRIPE_PRICE_DECOUVERTE_MONTHLY,
            decouverte_yearly: process.env.STRIPE_PRICE_DECOUVERTE_YEARLY,
            excellence_monthly: process.env.STRIPE_PRICE_EXCELLENCE_MONTHLY,
            excellence_yearly: process.env.STRIPE_PRICE_EXCELLENCE_YEARLY,
            famille_monthly: process.env.STRIPE_PRICE_FAMILLE_MONTHLY,
            famille_yearly: process.env.STRIPE_PRICE_FAMILLE_YEARLY
        };

        const priceId = priceIds[`${plan}_${period}`];
        
        if (!priceId) {
            return res.status(400).json({ error: 'Formule invalide' });
        }

        // Créer la session de paiement
        const session = await stripe.checkout.sessions.create({
            customer: stripeCustomerId,
            payment_method_types: ['card'],
            line_items: [{
                price: priceId,
                quantity: 1,
            }],
            mode: 'subscription',
            allow_promotion_codes: true,
            subscription_data: {
                trial_period_days: 7, // Essai gratuit de 7 jours
                metadata: {
                    userId: userId,
                    plan: plan,
                    period: period
                }
            },
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
                userId: userId,
                plan: plan,
                period: period
            }
        });

        res.json({ sessionId: session.id });

    } catch (error) {
        console.error('Erreur création session:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Démarrer un essai gratuit
 */
app.post('/api/trial/start', authenticateToken, async (req, res) => {
    try {
        const { plan } = req.body;
        const userId = req.user.id;

        // Calculer la date de fin d'essai (7 jours)
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 7);

        // Mettre à jour le profil
        const { error } = await supabase
            .from('profiles')
            .update({
                subscription_tier: plan,
                subscription_status: 'trial',
                trial_ends_at: trialEndsAt.toISOString()
            })
            .eq('id', userId);

        if (error) throw error;

        res.json({
            success: true,
            trialEndsAt: trialEndsAt.toISOString(),
            message: 'Essai gratuit démarré avec succès'
        });

    } catch (error) {
        console.error('Erreur démarrage essai:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Annuler un abonnement
 */
app.post('/api/subscriptions/cancel', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Récupérer l'abonnement Stripe
        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('stripe_subscription_id')
            .eq('profile_id', userId)
            .eq('status', 'active')
            .single();

        if (!subscription) {
            return res.status(404).json({ error: 'Abonnement actif non trouvé' });
        }

        // Annuler chez Stripe
        await stripe.subscriptions.update(subscription.stripe_subscription_id, {
            cancel_at_period_end: true
        });

        // Mettre à jour la base de données
        await supabase
            .from('subscriptions')
            .update({
                cancel_at_period_end: true,
                status: 'canceled'
            })
            .eq('stripe_subscription_id', subscription.stripe_subscription_id);

        res.json({
            success: true,
            message: 'Abonnement annulé avec succès'
        });

    } catch (error) {
        console.error('Erreur annulation:', error);
        res.status(500).json({ error: error.message });
    }
});

// =================== WEBHOOK STRIPE ===================

app.post('/api/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Erreur webhook:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Gérer les événements Stripe
    switch (event.type) {
        case 'checkout.session.completed':
            await handleCheckoutSessionCompleted(event.data.object);
            break;
            
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
            await handleSubscriptionUpdate(event.data.object);
            break;
            
        case 'customer.subscription.deleted':
            await handleSubscriptionDeleted(event.data.object);
            break;
            
        case 'invoice.payment_succeeded':
            await handleInvoicePaymentSucceeded(event.data.object);
            break;
            
        case 'invoice.payment_failed':
            await handleInvoicePaymentFailed(event.data.object);
            break;
    }

    res.json({received: true});
});

// =================== HANDLERS WEBHOOK ===================

async function handleCheckoutSessionCompleted(session) {
    try {
        const { userId, plan, period } = session.metadata;
        
        // Mettre à jour le profil utilisateur
        await supabase
            .from('profiles')
            .update({
                subscription_tier: plan,
                subscription_status: 'active'
            })
            .eq('id', userId);

        console.log(`Session checkout complétée pour l'utilisateur ${userId}`);
    } catch (error) {
        console.error('Erreur traitement checkout:', error);
    }
}

async function handleSubscriptionUpdate(subscription) {
    try {
        const { userId, plan, period } = subscription.metadata;
        
        // Mettre à jour l'abonnement dans la base de données
        await supabase
            .from('subscriptions')
            .upsert({
                stripe_subscription_id: subscription.id,
                stripe_customer_id: subscription.customer,
                profile_id: userId,
                plan: plan,
                period: period,
                status: subscription.status,
                current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
                current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
                trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
                cancel_at_period_end: subscription.cancel_at_period_end,
                amount: subscription.items.data[0].price.unit_amount,
                currency: subscription.currency
            });

        console.log(`Abonnement ${subscription.id} mis à jour: ${subscription.status}`);
    } catch (error) {
        console.error('Erreur mise à jour abonnement:', error);
    }
}

async function handleInvoicePaymentSucceeded(invoice) {
    try {
        // Enregistrer le paiement
        await supabase
            .from('payments')
            .insert({
                stripe_invoice_id: invoice.id,
                stripe_payment_intent_id: invoice.payment_intent,
                amount: invoice.amount_paid,
                currency: invoice.currency,
                status: 'succeeded',
                receipt_url: invoice.hosted_invoice_url
            });

        console.log(`Paiement réussi pour la facture ${invoice.id}`);
    } catch (error) {
        console.error('Erreur enregistrement paiement:', error);
    }
}

// =================== ROUTES DASHBOARD ===================

/**
 * Récupérer les statistiques du dashboard
 */
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Récupérer le profil
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        // Récupérer les enfants
        const { data: children } = await supabase
            .from('children')
            .select('*')
            .eq('parent_id', userId);

        // Récupérer les statistiques des enfants
        const childrenStats = await Promise.all(
            children.map(async (child) => {
                const { data: exercises } = await supabase
                    .from('exercise_sessions')
                    .select('score, correct')
                    .eq('child_id', child.id);

                const { data: videos } = await supabase
                    .from('video_watch_history')
                    .select('watched_seconds')
                    .eq('child_id', child.id);

                const totalExercises = exercises?.length || 0;
                const correctExercises = exercises?.filter(e => e.correct).length || 0;
                const totalVideoTime = videos?.reduce((sum, v) => sum + v.watched_seconds, 0) || 0;

                return {
                    ...child,
                    stats: {
                        totalExercises,
                        correctExercises,
                        successRate: totalExercises > 0 ? Math.round((correctExercises / totalExercises) * 100) : 0,
                        totalVideoTime: Math.round(totalVideoTime / 60) // Convertir en minutes
                    }
                };
            })
        );

        // Calculer les totaux
        const totals = childrenStats.reduce((acc, child) => {
            return {
                totalExercises: acc.totalExercises + child.stats.totalExercises,
                correctExercises: acc.correctExercises + child.stats.correctExercises,
                totalVideoTime: acc.totalVideoTime + child.stats.totalVideoTime
            };
        }, { totalExercises: 0, correctExercises: 0, totalVideoTime: 0 });

        // Ajouter le taux de réussite global
        totals.successRate = totals.totalExercises > 0 
            ? Math.round((totals.correctExercises / totals.totalExercises) * 100) 
            : 0;

        res.json({
            profile,
            children: childrenStats,
            totals,
            subscription: {
                tier: profile.subscription_tier,
                status: profile.subscription_status,
                trialEndsAt: profile.trial_ends_at,
                isTrialActive: profile.trial_ends_at && new Date(profile.trial_ends_at) > new Date()
            }
        });

    } catch (error) {
        console.error('Erreur récupération stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// =================== ROUTES EXERCICES ===================

/**
 * Récupérer les exercices
 */
app.get('/api/exercises', async (req, res) => {
    try {
        const { level, subject, limit = 10 } = req.query;

        let query = supabase
            .from('exercises')
            .select(`
                *,
                chapters (
                    title,
                    subject_id,
                    subjects (
                        name,
                        level
                    )
                )
            `)
            .limit(parseInt(limit));

        if (level) {
            query = query.eq('chapters.subjects.level', level);
        }

        if (subject) {
            query = query.eq('chapters.subjects.name', subject);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json(data || []);

    } catch (error) {
        console.error('Erreur récupération exercices:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Soumettre une réponse d'exercice
 */
app.post('/api/exercises/submit', authenticateToken, async (req, res) => {
    try {
        const { childId, exerciseId, userAnswer, timeSpent } = req.body;

        // Ici, vous devriez implémenter la logique de correction
        // Pour l'exemple, on simule une correction
        const isCorrect = Math.random() > 0.5; // Simulation
        const score = isCorrect ? 20 : 10; // Simulation

        // Enregistrer la session
        const { data, error } = await supabase
            .from('exercise_sessions')
            .insert([{
                child_id: childId,
                exercise_id: exerciseId,
                user_answer: userAnswer,
                correct: isCorrect,
                score: score,
                time_spent: timeSpent
            }])
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            data,
            correction: {
                correct: isCorrect,
                score: score,
                feedback: isCorrect ? 'Bonne réponse!' : 'Réponse incorrecte'
            }
        });

    } catch (error) {
        console.error('Erreur soumission exercice:', error);
        res.status(500).json({ error: error.message });
    }
});

// =================== ROUTES VIDÉOS ===================

/**
 * Récupérer les vidéos
 */
app.get('/api/videos', async (req, res) => {
    try {
        const { level, subject, limit = 10 } = req.query;

        let query = supabase
            .from('videos')
            .select(`
                *,
                chapters (
                    title,
                    subject_id,
                    subjects (
                        name,
                        level
                    )
                )
            `)
            .limit(parseInt(limit));

        if (level) {
            query = query.eq('chapters.subjects.level', level);
        }

        if (subject) {
            query = query.eq('chapters.subjects.name', subject);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json(data || []);

    } catch (error) {
        console.error('Erreur récupération vidéos:', error);
        res.status(500).json({ error: error.message });
    }
});

// =================== ROUTES PAIEMENTS ===================

/**
 * Récupérer les détails d'un paiement
 */
app.get('/api/payments/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['customer', 'subscription']
        });

        if (!session) {
            return res.status(404).json({ error: 'Session non trouvée' });
        }

        res.json({
            sessionId: session.id,
            status: session.payment_status,
            amount: session.amount_total,
            currency: session.currency,
            customerEmail: session.customer_details?.email,
            plan: session.metadata?.plan,
            period: session.metadata?.period
        });

    } catch (error) {
        console.error('Erreur récupération paiement:', error);
        res.status(500).json({ error: error.message });
    }
});

// =================== ROUTES PRODUITS STRIPE ===================

/**
 * Récupérer les produits Stripe
 */
app.get('/api/stripe/products', async (req, res) => {
    try {
        const products = await stripe.products.list({
            active: true,
            expand: ['data.default_price']
        });

        const formattedProducts = products.data.map(product => {
            const price = product.default_price;
            return {
                id: product.id,
                name: product.name,
                description: product.description,
                price: price ? {
                    id: price.id,
                    amount: price.unit_amount,
                    currency: price.currency,
                    interval: price.recurring?.interval
                } : null,
                metadata: product.metadata
            };
        });

        res.json(formattedProducts);

    } catch (error) {
        console.error('Erreur récupération produits:', error);
        res.status(500).json({ error: error.message });
    }
});

// =================== DÉMARRAGE DU SERVEUR ===================

app.get('/', (req, res) => {
    res.json({
        message: 'API SimosMaths',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth/*',
            subscriptions: '/api/subscriptions/*',
            dashboard: '/api/dashboard/*',
            exercises: '/api/exercices/*',
            videos: '/api/videos/*',
            payments: '/api/payments/*'
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Serveur API démarré sur le port ${PORT}`);
    console.log(`📊 Supabase: ${SUPABASE_URL}`);
    console.log(`💳 Stripe: Mode ${process.env.STRIPE_SECRET_KEY?.includes('test') ? 'Test' : 'Production'}`);
});