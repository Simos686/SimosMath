// api-server.js - À déployer SUR UN SERVEUR SÉPARÉ (Railway, Render, Heroku, Vercel)
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Charger les variables d'environnement
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - AJOUTEZ VOTRE DOMAINE GITHUB ICI
const allowedOrigins = [
    'http://localhost:3000',
    'https://votreusername.github.io', // VOTRE SITE GITHUB
    'https://simosmaths.com', // VOTRE DOMAINE PERSONNALISÉ (optionnel)
];

app.use(cors({
    origin: function (origin, callback) {
        // Autoriser les requêtes sans origine (comme Postman)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = `Origine ${origin} non autorisée par CORS`;
            console.error('CORS bloqué:', origin);
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));

app.use(express.json());
app.use(express.static('public'));

// Configuration REQUISE
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ ERREUR: Variables Supabase manquantes dans .env');
    process.exit(1);
}

if (!process.env.STRIPE_SECRET_KEY) {
    console.error('❌ ERREUR: Clé Stripe manquante dans .env');
    process.exit(1);
}

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
            console.error('Token invalide:', error?.message);
            return res.status(401).json({ error: 'Token invalide ou expiré' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Erreur authentification:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
}

// =================== ROUTES ESSENTIELLES POUR GITHUB ===================

/**
 * Route de test (public)
 */
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'SimosMaths API',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

/**
 * Récupérer les produits Stripe (public)
 */
app.get('/api/stripe/products', async (req, res) => {
    try {
        const products = await stripe.products.list({
            active: true,
            expand: ['data.default_price'],
            limit: 10
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

/**
 * Créer une session de paiement Stripe (protégé)
 */
app.post('/api/subscriptions/create', authenticateToken, async (req, res) => {
    try {
        const { plan, period, successUrl, cancelUrl } = req.body;
        const userId = req.user.id;

        // Vérifier si l'utilisateur existe
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (profileError || !profile) {
            return res.status(404).json({ error: 'Profil utilisateur non trouvé' });
        }

        // Récupérer ou créer un client Stripe
        let stripeCustomerId = profile.stripe_customer_id;
        
        if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
                email: profile.email,
                name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
                metadata: { userId, plan }
            });
            stripeCustomerId = customer.id;

            // Mettre à jour le profil
            await supabase
                .from('profiles')
                .update({ stripe_customer_id: customer.id })
                .eq('id', userId);
        }

        // IDs de prix (à configurer dans Stripe Dashboard)
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
            return res.status(400).json({ error: `Formule ${plan} (${period}) non disponible` });
        }

        // Créer la session Stripe
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
                trial_period_days: 7,
                metadata: { userId, plan, period }
            },
            success_url: successUrl || `${req.headers.origin}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl || `${req.headers.origin}/tarifs.html`,
            metadata: { userId, plan, period }
        });

        res.json({ 
            sessionId: session.id,
            url: session.url 
        });

    } catch (error) {
        console.error('Erreur création session Stripe:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Démarrer un essai gratuit (protégé)
 */
app.post('/api/trial/start', authenticateToken, async (req, res) => {
    try {
        const { plan } = req.body;
        const userId = req.user.id;

        // Vérifier si déjà en essai ou abonné
        const { data: existing } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('profile_id', userId)
            .in('status', ['active', 'trial'])
            .single();

        if (existing) {
            return res.status(400).json({ 
                error: 'Vous avez déjà un abonnement actif ou un essai en cours' 
            });
        }

        // Date de fin d'essai (7 jours)
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 7);

        // Créer un abonnement "trial" dans la base
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .insert([{
                profile_id: userId,
                plan: plan,
                period: 'monthly',
                status: 'trial',
                trial_start: new Date().toISOString(),
                trial_end: trialEndsAt.toISOString(),
                current_period_end: trialEndsAt.toISOString()
            }])
            .select()
            .single();

        if (subError) throw subError;

        // Mettre à jour le profil
        await supabase
            .from('profiles')
            .update({
                subscription_tier: plan,
                subscription_status: 'trial',
                trial_ends_at: trialEndsAt.toISOString()
            })
            .eq('id', userId);

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

// =================== ROUTES SIMPLIFIÉES POUR GITHUB ===================

/**
 * Récupérer les exercices (public avec limitations)
 */
app.get('/api/exercises', async (req, res) => {
    try {
        const { level, subject, limit = 5 } = req.query;

        let query = supabase
            .from('exercises')
            .select(`
                id, title, question, difficulty, points,
                chapters!inner (
                    title,
                    subjects!inner (name, level)
                )
            `)
            .limit(Math.min(parseInt(limit), 10)); // Limiter à 10 max

        if (level) query = query.eq('chapters.subjects.level', level);
        if (subject) query = query.eq('chapters.subjects.name', subject);

        const { data, error } = await query;

        if (error) throw error;

        // Masquer les solutions pour les utilisateurs non authentifiés
        const safeData = data.map(exercise => ({
            ...exercise,
            solution: undefined // Cacher la solution
        }));

        res.json(safeData || []);

    } catch (error) {
        console.error('Erreur récupération exercices:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Soumettre un exercice (protégé)
 */
app.post('/api/exercises/submit', authenticateToken, async (req, res) => {
    try {
        const { childId, exerciseId, userAnswer, timeSpent } = req.body;

        // Vérifier que l'enfant appartient à l'utilisateur
        const { data: child, error: childError } = await supabase
            .from('children')
            .select('parent_id')
            .eq('id', childId)
            .single();

        if (childError || child.parent_id !== req.user.id) {
            return res.status(403).json({ error: 'Accès non autorisé à cet enfant' });
        }

        // Récupérer l'exercice et sa solution
        const { data: exercise, error: exError } = await supabase
            .from('exercises')
            .select('solution, hints')
            .eq('id', exerciseId)
            .single();

        if (exError) throw exError;

        // Correction simple (à améliorer)
        const isCorrect = userAnswer.trim().toLowerCase() === exercise.solution.trim().toLowerCase();
        const score = isCorrect ? 20 : Math.max(0, 20 - Math.floor(timeSpent / 60)); // Pénalité temps

        // Enregistrer la session
        const { data: session, error: sessionError } = await supabase
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

        if (sessionError) throw sessionError;

        res.json({
            success: true,
            data: session,
            correction: {
                correct: isCorrect,
                score: score,
                feedback: isCorrect ? 'Bravo ! Réponse correcte.' : 'Réponse incorrecte.',
                solution: exercise.solution,
                hints: exercise.hints || []
            }
        });

    } catch (error) {
        console.error('Erreur soumission exercice:', error);
        res.status(500).json({ error: error.message });
    }
});

// =================== GESTION DES ERREURS ===================

// 404 - Route non trouvée
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Route non trouvée',
        path: req.path,
        method: req.method
    });
});

// Gestionnaire d'erreurs global
app.use((error, req, res, next) => {
    console.error('Erreur globale:', error);
    res.status(error.status || 500).json({
        error: error.message || 'Erreur interne du serveur',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
});

// =================== DÉMARRAGE ===================

const startServer = async () => {
    try {
        // Vérifier la connexion à Supabase
        const { error: supabaseError } = await supabase.from('profiles').select('count').limit(1);
        if (supabaseError) {
            console.error('❌ Connexion Supabase échouée:', supabaseError.message);
            process.exit(1);
        }

        // Vérifier la connexion Stripe
        await stripe.products.list({ limit: 1 });
        
        app.listen(PORT, () => {
            console.log(`🚀 API SimosMaths démarrée sur le port ${PORT}`);
            console.log(`📊 Supabase: ${SUPABASE_URL ? '✅ Connecté' : '❌ Non configuré'}`);
            console.log(`💳 Stripe: ${STRIPE_SECRET_KEY ? '✅ Configuré' : '❌ Non configuré'}`);
            console.log(`🌐 CORS autorisés: ${allowedOrigins.join(', ')}`);
        });
        
    } catch (error) {
        console.error('❌ Erreur démarrage serveur:', error);
        process.exit(1);
    }
};

startServer();
