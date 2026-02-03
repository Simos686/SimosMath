// supabase-client.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getConfig } from './config.js'

const config = getConfig();
const supabaseUrl = config.SUPABASE.URL;
const supabaseAnonKey = config.SUPABASE.ANON_KEY;

// Initialiser le client Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    },
    db: {
        schema: 'public'
    }
});

// =================== AUTHENTIFICATION ===================

/**
 * Inscription d'un nouvel utilisateur
 */
export async function signUp(email, password, userData = {}) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    first_name: userData.firstName || '',
                    last_name: userData.lastName || '',
                    phone: userData.phone || '',
                    ...userData
                },
                emailRedirectTo: `${window.location.origin}/auth-callback.html`
            }
        });

        if (error) throw error;

        return {
            success: true,
            user: data.user,
            session: data.session,
            message: data.user?.identities?.length === 0 
                ? 'Un email de confirmation a été envoyé.' 
                : 'Inscription réussie !'
        };
    } catch (error) {
        console.error('Erreur inscription:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Connexion avec email/mot de passe
 */
export async function signIn(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        // Récupérer le profil utilisateur
        const profile = await getUserProfile(data.user.id);
        
        return {
            success: true,
            user: data.user,
            session: data.session,
            profile: profile
        };
    } catch (error) {
        console.error('Erreur connexion:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Connexion avec Google
 */
export async function signInWithGoogle() {
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth-callback.html`,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent'
                }
            }
        });

        if (error) throw error;
        return { success: true, url: data.url };
    } catch (error) {
        console.error('Erreur Google Auth:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Déconnexion
 */
export async function signOut() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        
        // Rediriger vers la page d'accueil
        window.location.href = '/';
    } catch (error) {
        console.error('Erreur déconnexion:', error);
        alert('Erreur lors de la déconnexion: ' + error.message);
    }
}

/**
 * Récupérer l'utilisateur actuel
 */
export async function getCurrentUser() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        return user;
    } catch (error) {
        console.error('Erreur récupération utilisateur:', error);
        return null;
    }
}

// =================== PROFILS UTILISATEURS ===================

/**
 * Récupérer le profil utilisateur
 */
export async function getUserProfile(userId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            // Si le profil n'existe pas, le créer
            if (error.code === 'PGRST116') {
                const user = await getCurrentUser();
                if (user) {
                    const newProfile = {
                        id: userId,
                        email: user.email,
                        first_name: user.user_metadata?.first_name || user.email?.split('@')[0],
                        last_name: user.user_metadata?.last_name || '',
                        role: 'parent'
                    };
                    
                    const { data: createdProfile, error: createError } = await supabase
                        .from('profiles')
                        .insert([newProfile])
                        .select()
                        .single();
                    
                    if (createError) throw createError;
                    return createdProfile;
                }
            }
            throw error;
        }
        return data;
    } catch (error) {
        console.error('Erreur récupération profil:', error);
        return null;
    }
}

/**
 * Mettre à jour le profil utilisateur
 */
export async function updateUserProfile(userId, updates) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Erreur mise à jour profil:', error);
        return { success: false, error: error.message };
    }
}

// =================== ENFANTS ===================

/**
 * Ajouter un nouvel enfant
 */
export async function addChild(parentId, childData) {
    try {
        const { data, error } = await supabase
            .from('children')
            .insert([{
                parent_id: parentId,
                first_name: childData.firstName,
                last_name: childData.lastName,
                birth_date: childData.birthDate,
                school_level: childData.schoolLevel,
                school_name: childData.schoolName,
                favorite_subjects: childData.favoriteSubjects || []
            }])
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Erreur ajout enfant:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Récupérer les enfants d'un parent
 */
export async function getChildren(parentId) {
    try {
        const { data, error } = await supabase
            .from('children')
            .select('*')
            .eq('parent_id', parentId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erreur récupération enfants:', error);
        return [];
    }
}

/**
 * Mettre à jour les informations d'un enfant
 */
export async function updateChild(childId, updates) {
    try {
        const { data, error } = await supabase
            .from('children')
            .update(updates)
            .eq('id', childId)
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Erreur mise à jour enfant:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Supprimer un enfant
 */
export async function deleteChild(childId) {
    try {
        const { error } = await supabase
            .from('children')
            .delete()
            .eq('id', childId);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Erreur suppression enfant:', error);
        return { success: false, error: error.message };
    }
}

// =================== ABONNEMENTS & PAIEMENTS ===================

/**
 * Vérifier l'abonnement actif d'un utilisateur
 */
export async function checkActiveSubscription(userId) {
    try {
        const { data, error } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('profile_id', userId)
            .in('status', ['active', 'trial'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    } catch (error) {
        console.error('Erreur vérification abonnement:', error);
        return null;
    }
}

/**
 * Récupérer l'historique des paiements
 */
export async function getPaymentHistory(userId) {
    try {
        const { data, error } = await supabase
            .from('payments')
            .select('*')
            .eq('profile_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erreur récupération paiements:', error);
        return [];
    }
}

// =================== EXERCICES ===================

/**
 * Récupérer les exercices par niveau et matière
 */
export async function getExercises(level, subject, limit = 10) {
    try {
        const { data, error } = await supabase
            .from('exercises')
            .select(`
                *,
                chapters!inner (
                    title,
                    subject_id,
                    subjects!inner (
                        name,
                        level
                    )
                )
            `)
            .eq('chapters.subjects.level', level)
            .eq('chapters.subjects.name', subject)
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erreur récupération exercices:', error);
        return [];
    }
}

/**
 * Enregistrer une session d'exercice
 */
export async function saveExerciseSession(sessionData) {
    try {
        const { data, error } = await supabase
            .from('exercise_sessions')
            .insert([{
                child_id: sessionData.childId,
                exercise_id: sessionData.exerciseId,
                user_answer: sessionData.userAnswer,
                correct: sessionData.correct,
                score: sessionData.score,
                time_spent: sessionData.timeSpent
            }])
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Erreur sauvegarde session:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Récupérer l'historique des exercices d'un enfant
 */
export async function getChildExerciseHistory(childId, limit = 20) {
    try {
        const { data, error } = await supabase
            .from('exercise_sessions')
            .select(`
                *,
                exercises!inner (
                    title,
                    difficulty,
                    points,
                    chapters!inner (
                        title,
                        subjects!inner (
                            name
                        )
                    )
                )
            `)
            .eq('child_id', childId)
            .order('completed_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erreur récupération historique:', error);
        return [];
    }
}

// =================== VIDÉOS ===================

/**
 * Récupérer les vidéos par niveau et matière
 */
export async function getVideos(level, subject, limit = 10) {
    try {
        const { data, error } = await supabase
            .from('videos')
            .select(`
                *,
                chapters!inner (
                    title,
                    subject_id,
                    subjects!inner (
                        name,
                        level
                    )
                )
            `)
            .eq('chapters.subjects.level', level)
            .eq('chapters.subjects.name', subject)
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erreur récupération vidéos:', error);
        return [];
    }
}

/**
 * Enregistrer la progression d'une vidéo
 */
export async function saveVideoProgress(progressData) {
    try {
        const { data, error } = await supabase
            .from('video_watch_history')
            .upsert([{
                child_id: progressData.childId,
                video_id: progressData.videoId,
                watched_seconds: progressData.watchedSeconds,
                completed: progressData.completed,
                completed_at: progressData.completed ? new Date().toISOString() : null,
                last_position: progressData.lastPosition
            }], {
                onConflict: 'child_id,video_id'
            })
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Erreur sauvegarde progression:', error);
        return { success: false, error: error.message };
    }
}

// =================== STATISTIQUES ===================

/**
 * Récupérer les statistiques d'un enfant (Version corrigée)
 */
export async function getChildStats(childId) {
    try {
        // Récupérer les progrès avec les bonnes relations
        const { data: progress, error: progressError } = await supabase
            .from('progress')
            .select(`
                *,
                subjects:subject_id (name, icon, color),
                chapters:chapter_id (title)
            `)
            .eq('child_id', childId);

        if (progressError) throw progressError;

        // Récupérer les badges
        const { data: badges, error: badgesError } = await supabase
            .from('earned_badges')
            .select(`
                *,
                badges:badge_id (name, icon, color, description)
            `)
            .eq('child_id', childId);

        if (badgesError) throw badgesError;

        // Récupérer les exercices récents
        const { data: recentExercises, error: exercisesError } = await supabase
            .from('exercise_sessions')
            .select(`
                created_at,
                score,
                exercises!inner (
                    title
                )
            `)
            .eq('child_id', childId)
            .order('created_at', { ascending: false })
            .limit(5);

        if (exercisesError) throw exercisesError;

        // Récupérer les vidéos récentes
        const { data: recentVideos, error: videosError } = await supabase
            .from('video_watch_history')
            .select(`
                created_at,
                videos!inner (
                    title
                )
            `)
            .eq('child_id', childId)
            .order('created_at', { ascending: false })
            .limit(5);

        if (videosError) throw videosError;

        // Formater les activités récentes
        const recentActivities = [];
        
        if (recentExercises) {
            recentExercises.forEach(ex => {
                recentActivities.push({
                    activity_type: 'exercise',
                    activity_title: ex.exercises?.title || 'Exercice',
                    score: ex.score,
                    activity_date: ex.created_at
                });
            });
        }

        if (recentVideos) {
            recentVideos.forEach(vid => {
                recentActivities.push({
                    activity_type: 'video',
                    activity_title: vid.videos?.title || 'Vidéo',
                    score: null,
                    activity_date: vid.created_at
                });
            });
        }

        // Trier par date
        recentActivities.sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date));

        return {
            progress: progress || [],
            badges: badges || [],
            recentActivities: recentActivities.slice(0, 10),
            // Calculer les totaux
            totalExercises: progress?.reduce((sum, p) => sum + (p.total_exercises || 0), 0) || 0,
            completedExercises: progress?.reduce((sum, p) => sum + (p.completed_exercises || 0), 0) || 0,
            averageScore: progress && progress.length > 0 
                ? Math.round(progress.reduce((sum, p) => sum + (p.average_score || 0), 0) / progress.length)
                : 0
        };

    } catch (error) {
        console.error('Erreur récupération statistiques:', error);
        return {
            progress: [],
            badges: [],
            recentActivities: [],
            totalExercises: 0,
            completedExercises: 0,
            averageScore: 0
        };
    }
}

/**
 * Récupérer les statistiques globales d'un parent (Version corrigée)
 */
export async function getParentStats(parentId) {
    try {
        // Récupérer les enfants
        const children = await getChildren(parentId);
        
        if (!children || children.length === 0) {
            return {
                profile: await getUserProfile(parentId),
                children: [],
                totals: {
                    childrenCount: 0,
                    totalExercises: 0,
                    totalVideoTime: 0,
                    averageScore: 0
                }
            };
        }
        
        // Récupérer les statistiques pour chaque enfant
        const childrenStats = await Promise.all(
            children.map(async (child) => {
                const stats = await getChildStats(child.id);
                return {
                    ...child,
                    stats: stats
                };
            })
        );

        // Calculer les totaux
        let totalExercises = 0;
        let totalVideoTime = 0;
        let totalScore = 0;
        let childrenWithScore = 0;

        childrenStats.forEach(child => {
            if (child.stats) {
                totalExercises += child.stats.totalExercises || 0;
                
                // Estimer le temps vidéo (approximatif)
                totalVideoTime += child.stats.recentActivities.filter(a => a.activity_type === 'video').length * 5;
                
                if (child.stats.averageScore > 0) {
                    totalScore += child.stats.averageScore;
                    childrenWithScore++;
                }
            }
        });

        const averageScore = childrenWithScore > 0 ? Math.round(totalScore / childrenWithScore) : 0;

        return {
            profile: await getUserProfile(parentId),
            children: childrenStats,
            totals: {
                childrenCount: children.length,
                totalExercises,
                totalVideoTime,
                averageScore
            }
        };

    } catch (error) {
        console.error('Erreur récupération stats parent:', error);
        return {
            profile: null,
            children: [],
            totals: {
                childrenCount: 0,
                totalExercises: 0,
                totalVideoTime: 0,
                averageScore: 0
            }
        };
    }
}

// =================== UTILITAIRES ===================

/**
 * Écouter les changements d'authentification
 */
export function onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });
}

/**
 * Vérifier si l'utilisateur a accès à une fonctionnalité premium
 */
export async function hasPremiumAccess(userId) {
    try {
        const subscription = await checkActiveSubscription(userId);
        if (!subscription) return false;
        
        const now = new Date();
        
        // Vérifier la période d'essai
        if (subscription.trial_end) {
            const trialEnd = new Date(subscription.trial_end);
            if (trialEnd > now) return true;
        }
        
        // Vérifier l'abonnement actif
        if (subscription.status === 'active') {
            if (subscription.current_period_end) {
                const periodEnd = new Date(subscription.current_period_end);
                return periodEnd > now;
            }
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Erreur vérification premium:', error);
        return false;
    }
}

/**
 * Formater la date pour l'affichage
 */
export function formatDate(dateString, format = 'fr-FR') {
    if (!dateString) return 'Date inconnue';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Date invalide';
        
        return new Intl.DateTimeFormat(format, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    } catch (error) {
        console.error('Erreur formatage date:', error);
        return dateString;
    }
}

/**
 * Vérifier la session actuelle
 */
export async function checkSession() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        return session;
    } catch (error) {
        console.error('Erreur vérification session:', error);
        return null;
    }
}

// Exporter les fonctions principales
export default {
    // Client Supabase
    supabase,
    
    // Auth
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    getCurrentUser,
    onAuthStateChange,
    checkSession,
    
    // Profiles
    getUserProfile,
    updateUserProfile,
    
    // Children
    addChild,
    getChildren,
    updateChild,
    deleteChild,
    
    // Subscriptions
    checkActiveSubscription,
    getPaymentHistory,
    hasPremiumAccess,
    
    // Exercises
    getExercises,
    saveExerciseSession,
    getChildExerciseHistory,
    
    // Videos
    getVideos,
    saveVideoProgress,
    
    // Stats
    getChildStats,
    getParentStats,
    
    // Utils
    formatDate
};