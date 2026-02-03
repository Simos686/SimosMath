// supabase-client.js - Version optimisée GitHub Pages
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// =================== CONFIGURATION AVEC FALLBACK ===================

// Fallback si config.js n'existe pas
let supabaseUrl, supabaseAnonKey;

try {
    // Essayer d'importer config.js
    const module = await import('./config.js');
    const config = module.getConfig ? module.getConfig() : module.default || module;
    
    supabaseUrl = config.SUPABASE?.URL || 'https://kgmtlwvqidhavehgsbwb.supabase.co';
    supabaseAnonKey = config.SUPABASE?.ANON_KEY || 'INSÉREZ-VOTRE-CLÉ-ICI';
    
} catch (error) {
    console.warn('⚠️ Config.js non trouvé, utilisation des valeurs par défaut');
    
    // Valeurs par défaut (À REMPLACER AVEC VOS VRAIES CLÉS)
    supabaseUrl = 'https://kgmtlwvqidhavehgsbwb.supabase.co';
    supabaseAnonKey = 'INSÉREZ-VOTRE-CLÉ-ANON-ICI'; // ⚠️ IMPORTANT : À CHANGER
    
    // Avertissement dans la console
    if (typeof window !== 'undefined') {
        console.error('❌ CLÉS SUPABASE NON CONFIGURÉES !');
        console.log('📋 Pour configurer :');
        console.log('1. Allez sur Supabase → Settings → API');
        console.log('2. Copiez URL et anon key');
        console.log('3. Mettez-les dans config.js ou ici directement');
    }
}

// =================== INITIALISATION SUPABASE ===================

// Initialiser le client Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined
    },
    db: {
        schema: 'public'
    },
    global: {
        headers: {
            'X-Client-Info': 'simosmaths-github-pages'
        }
    }
});

// =================== AUTHENTIFICATION (inchangé) ===================
// [Gardez tout votre code d'authentification existant]
// ...

// =================== NOUVELLE FONCTION : INITIALIZE APP ===================

/**
 * Initialiser et vérifier la connexion à Supabase
 */
export async function initializeApp() {
    try {
        console.log('🔄 Vérification connexion Supabase...');
        
        // Vérifier la connexion avec une requête simple
        const { error } = await supabase
            .from('profiles')
            .select('count')
            .limit(1);
        
        if (error) {
            console.error('❌ Connexion Supabase échouée:', error.message);
            
            // Vérifier si c'est une erreur de clé
            if (error.message.includes('JWT')) {
                console.error('❌ Problème avec la clé API Supabase');
                console.error('🔑 URL:', supabaseUrl);
                console.error('🔑 Clé (début):', supabaseAnonKey?.substring(0, 20) + '...');
                
                if (typeof window !== 'undefined') {
                    setTimeout(() => {
                        const alertEl = document.createElement('div');
                        alertEl.className = 'fixed bottom-4 right-4 bg-yellow-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 max-w-md';
                        alertEl.innerHTML = `
                            <div class="flex items-start">
                                <i class="fas fa-exclamation-triangle mt-1 mr-3"></i>
                                <div>
                                    <p class="font-bold">Configuration requise</p>
                                    <p class="text-sm opacity-90">Veuillez configurer vos clés Supabase dans config.js</p>
                                </div>
                            </div>
                        `;
                        document.body.appendChild(alertEl);
                        setTimeout(() => alertEl.remove(), 10000);
                    }, 3000);
                }
            }
            
            return { 
                success: false, 
                error: error.message,
                supabaseUrl: supabaseUrl,
                keyConfigured: !supabaseAnonKey.includes('INSÉREZ')
            };
        }
        
        console.log('✅ Supabase connecté avec succès');
        console.log('🔗 URL:', supabaseUrl);
        
        return { 
            success: true,
            supabaseUrl: supabaseUrl 
        };
        
    } catch (error) {
        console.error('❌ Erreur initialisation:', error);
        return { 
            success: false, 
            error: error.message 
        };
    }
}

// =================== EXPORT COMPLET ===================

// Exporter toutes les fonctions existantes + nouvelles
export default {
    // Client
    supabase,
    initializeApp,
    
    // Auth (vos fonctions existantes)
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
    
    // ... toutes vos autres fonctions
};

// Initialisation automatique au chargement
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            initializeApp().then(result => {
                if (!result.success) {
                    console.warn('⚠️ Application en mode développement - certaines fonctionnalités peuvent être limitées');
                }
            });
        }, 500);
    });
}
