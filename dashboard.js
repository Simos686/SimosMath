// dashboard.js - Logique spécifique au tableau de bord
import { supabase, getChildren, addChild, formatDate, getUserProfile } from './supabase-client.js';
import Chart from 'chart.js/auto';

class DashboardManager {
    constructor() {
        if (window.dashboardManager) {
            console.warn('DashboardManager déjà initialisé');
            return;
        }
        this.user = null;
        this.stats = null;
        this.children = [];
        this.recentActivities = [];
        this.initialize();
    }

    async initialize() {
        try {
            // Vérifier l'authentification
            const { data: { user }, error } = await supabase.auth.getUser();
            
            if (error) {
                console.error('Erreur auth:', error);
                window.location.href = '/auth.html';
                return;
            }
            
            if (!user) {
                window.location.href = '/auth.html';
                return;
            }
            
            this.user = user;

            // Vérifier si on est sur la page dashboard
            if (!document.getElementById('dashboard-content')) {
                console.log('Pas sur la page dashboard, initialisation limitée');
                return;
            }

            // Charger les données
            await this.loadDashboardData();
            
            // Initialiser les événements
            this.setupEventListeners();
            
            // Initialiser les graphiques
            this.initCharts();
            
            // Mettre à jour l'interface
            this.updateUI();

        } catch (error) {
            console.error('Erreur initialisation dashboard:', error);
            this.showError('Erreur de chargement du tableau de bord');
            // Rediriger vers l'authentification après 3 secondes
            setTimeout(() => window.location.href = '/auth.html', 3000);
        }
    }

    async loadDashboardData() {
        try {
            // Afficher le loading
            this.showLoading();
            
            // Charger les enfants
            this.children = await getChildren(this.user.id);
            
            // Charger le profil utilisateur
            const profile = await getUserProfile(this.user.id);
            
            // Calculer les statistiques
            this.stats = await this.calculateStats();
            this.stats.profile = profile;
            
            // Charger les activités récentes
            await this.loadRecentActivities();
            
            // Cacher le loading
            this.hideLoading();

        } catch (error) {
            console.error('Erreur chargement données:', error);
            throw error;
        }
    }

    async calculateStats() {
        const totals = {
            childrenCount: this.children.length,
            totalExercises: 0,
            totalVideoTime: 0,
            successRate: 0
        };

        // Pour chaque enfant, récupérer les statistiques
        const childrenStats = await Promise.all(
            this.children.map(async (child) => {
                const childStats = await this.getChildStats(child.id);
                return {
                    ...child,
                    stats: childStats
                };
            })
        );

        // Calculer les totaux
        childrenStats.forEach(child => {
            if (child.stats) {
                totals.totalExercises += child.stats.totalExercises || 0;
                totals.totalVideoTime += child.stats.totalVideoTime || 0;
                if (child.stats.averageScore > 0) {
                    totals.successRate += child.stats.averageScore;
                }
            }
        });

        if (this.children.length > 0) {
            totals.successRate = Math.round(totals.successRate / this.children.length);
        }

        return {
            totals,
            children: childrenStats
        };
    }

    async getChildStats(childId) {
        try {
            // Récupérer les exercices complétés
            const { data: exercises, error: exError } = await supabase
                .from('exercise_sessions')
                .select('score, correct')
                .eq('child_id', childId);

            if (exError) throw exError;

            // Récupérer le temps de vidéo
            const { data: videos, error: vidError } = await supabase
                .from('video_watch_history')
                .select('watched_seconds')
                .eq('child_id', childId);

            if (vidError) throw vidError;

            // Récupérer les badges
            const { data: badges, error: badgeError } = await supabase
                .from('earned_badges')
                .select('badge_id')
                .eq('child_id', childId);

            if (badgeError) throw badgeError;

            const totalExercises = exercises?.length || 0;
            const correctExercises = exercises?.filter(e => e.correct).length || 0;
            const totalVideoTime = videos?.reduce((sum, v) => sum + (v.watched_seconds || 0), 0) || 0;
            const averageScore = totalExercises > 0 
                ? Math.round((correctExercises / totalExercises) * 100)
                : 0;

            return {
                totalExercises,
                correctExercises,
                successRate: averageScore,
                averageScore,
                totalVideoTime: Math.round(totalVideoTime / 60), // Convertir en minutes
                badges: badges || []
            };

        } catch (error) {
            console.error('Erreur stats enfant:', error);
            return {
                totalExercises: 0,
                correctExercises: 0,
                successRate: 0,
                averageScore: 0,
                totalVideoTime: 0,
                badges: []
            };
        }
    }

    async loadRecentActivities() {
        try {
            const activities = [];
            
            for (const child of this.children) {
                // Récupérer les exercices récents
                const { data: exercises } = await supabase
                    .from('exercise_sessions')
                    .select(`
                        created_at,
                        score,
                        exercises (
                            title
                        )
                    `)
                    .eq('child_id', child.id)
                    .order('created_at', { ascending: false })
                    .limit(3);

                // Récupérer les vidéos récentes
                const { data: videos } = await supabase
                    .from('video_watch_history')
                    .select(`
                        created_at,
                        videos (
                            title
                        )
                    `)
                    .eq('child_id', child.id)
                    .order('created_at', { ascending: false })
                    .limit(2);

                // Formater les exercices
                if (exercises) {
                    exercises.forEach(ex => {
                        activities.push({
                            childName: child.first_name,
                            activity_type: 'exercise',
                            activity_title: ex.exercises?.title || 'Exercice',
                            score: ex.score,
                            activity_date: ex.created_at
                        });
                    });
                }

                // Formater les vidéos
                if (videos) {
                    videos.forEach(vid => {
                        activities.push({
                            childName: child.first_name,
                            activity_type: 'video',
                            activity_title: vid.videos?.title || 'Vidéo',
                            score: null,
                            activity_date: vid.created_at
                        });
                    });
                }
            }
            
            // Trier par date et limiter à 10
            this.recentActivities = activities
                .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
                .slice(0, 10);

        } catch (error) {
            console.error('Erreur chargement activités:', error);
            this.recentActivities = [];
        }
    }

    setupEventListeners() {
        // Bouton d'ajout d'enfant
        const addChildBtn = document.getElementById('add-child-btn');
        if (addChildBtn) {
            addChildBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showAddChildModal();
            });
        }

        // Bouton de déconnexion
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try {
                    await supabase.auth.signOut();
                    window.location.href = '/index.html';
                } catch (error) {
                    console.error('Erreur déconnexion:', error);
                }
            });
        }

        // Menu mobile
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const mobileMenu = document.getElementById('mobile-menu');
        if (mobileMenuBtn && mobileMenu) {
            mobileMenuBtn.addEventListener('click', () => {
                mobileMenu.classList.toggle('hidden');
            });
        }

        // Rafraîchissement des données
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshData());
        }

        // Écouter les changements d'authentification
        supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') {
                window.location.href = '/index.html';
            }
        });
    }

    initCharts() {
        // Graphique de progression
        const progressCtx = document.getElementById('progress-chart');
        if (progressCtx && this.stats && this.children.length > 0) {
            const labels = this.children.map(child => child.first_name);
            const exerciseData = this.children.map(child => 
                child.stats?.totalExercises || 0
            );
            const scoreData = this.children.map(child => 
                child.stats?.successRate || 0
            );

            // Détruire le graphique existant s'il y en a un
            if (this.progressChart) {
                this.progressChart.destroy();
            }

            this.progressChart = new Chart(progressCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Exercices complétés',
                        data: exerciseData,
                        backgroundColor: '#4361ee',
                        borderColor: '#3a0ca3',
                        borderWidth: 1
                    }, {
                        label: 'Taux de réussite (%)',
                        data: scoreData,
                        backgroundColor: '#4cc9f0',
                        borderColor: '#4895ef',
                        borderWidth: 1,
                        type: 'line',
                        yAxisID: 'y1'
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Exercices'
                            }
                        },
                        y1: {
                            position: 'right',
                            beginAtZero: true,
                            max: 100,
                            title: {
                                display: true,
                                text: 'Taux de réussite %'
                            },
                            grid: {
                                drawOnChartArea: false
                            }
                        }
                    }
                }
            });
        }

        // Graphique de répartition des matières
        const subjectCtx = document.getElementById('subject-chart');
        if (subjectCtx && this.stats) {
            // Récupérer la répartition des matières
            const { data: progress } = await supabase
                .from('progress')
                .select(`
                    total_exercises,
                    subjects (name)
                `)
                .in('child_id', this.children.map(c => c.id));

            if (progress && progress.length > 0) {
                const subjectDistribution = {};
                progress.forEach(p => {
                    const subjectName = p.subjects?.name || 'Autre';
                    subjectDistribution[subjectName] = 
                        (subjectDistribution[subjectName] || 0) + (p.total_exercises || 0);
                });

                // Détruire le graphique existant
                if (this.subjectChart) {
                    this.subjectChart.destroy();
                }

                this.subjectChart = new Chart(subjectCtx, {
                    type: 'doughnut',
                    data: {
                        labels: Object.keys(subjectDistribution),
                        datasets: [{
                            data: Object.values(subjectDistribution),
                            backgroundColor: [
                                '#4361ee', '#4cc9f0', '#f72585', 
                                '#7209b7', '#2ec4b6', '#ffbe0b'
                            ]
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                position: 'bottom'
                            }
                        }
                    }
                });
            }
        }
    }

    updateUI() {
        // Mettre à jour le nom d'utilisateur
        const userNameEl = document.getElementById('user-name');
        if (userNameEl && this.user) {
            const firstName = this.user.user_metadata?.first_name;
            const email = this.user.email || '';
            userNameEl.textContent = firstName || email.split('@')[0];
        }

        // Mettre à jour les statistiques
        this.updateStats();

        // Mettre à jour la liste des enfants
        this.updateChildrenList();

        // Mettre à jour les activités récentes
        this.updateRecentActivities();

        // Mettre à jour l'abonnement
        this.updateSubscriptionStatus();
    }

    updateStats() {
        if (!this.stats) return;

        const stats = this.stats.totals;
        
        // Total exercices
        const totalExercisesEl = document.getElementById('total-exercises');
        if (totalExercisesEl) {
            totalExercisesEl.textContent = stats.totalExercises.toLocaleString();
        }

        // Taux de réussite
        const successRateEl = document.getElementById('success-rate');
        if (successRateEl) {
            successRateEl.textContent = `${stats.successRate}%`;
        }

        // Temps total
        const totalTimeEl = document.getElementById('total-time');
        if (totalTimeEl) {
            const hours = Math.floor(stats.totalVideoTime / 60);
            const minutes = stats.totalVideoTime % 60;
            totalTimeEl.textContent = hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
        }

        // Nombre d'enfants
        const childrenCountEl = document.getElementById('children-count');
        if (childrenCountEl) {
            childrenCountEl.textContent = stats.childrenCount;
        }
    }

    updateChildrenList() {
        const childrenListEl = document.getElementById('children-list');
        if (!childrenListEl || !this.children) return;

        childrenListEl.innerHTML = this.children.map(child => `
            <div class="child-card bg-white rounded-xl p-4 shadow border border-gray-100 hover:shadow-md transition">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center">
                        <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold mr-3">
                            ${(child.first_name?.charAt(0) || '')}${(child.last_name?.charAt(0) || '')}
                        </div>
                        <div>
                            <h4 class="font-bold text-gray-900">${child.first_name || ''} ${child.last_name || ''}</h4>
                            <p class="text-sm text-gray-600">${child.school_level || 'Non spécifié'} • ${child.school_name || ''}</p>
                        </div>
                    </div>
                    <button class="text-blue-600 hover:text-blue-800 edit-child-btn" data-child-id="${child.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
                
                <div class="grid grid-cols-3 gap-2 text-center mb-3">
                    <div class="bg-blue-50 rounded-lg p-2">
                        <div class="text-lg font-bold text-blue-600">${child.stats?.totalExercises || 0}</div>
                        <div class="text-xs text-gray-600">Exercices</div>
                    </div>
                    <div class="bg-green-50 rounded-lg p-2">
                        <div class="text-lg font-bold text-green-600">${child.stats?.successRate || 0}%</div>
                        <div class="text-xs text-gray-600">Réussite</div>
                    </div>
                    <div class="bg-purple-50 rounded-lg p-2">
                        <div class="text-lg font-bold text-purple-600">${child.stats?.badges?.length || 0}</div>
                        <div class="text-xs text-gray-600">Badges</div>
                    </div>
                </div>
                
                <div class="text-center">
                    <a href="child-progress.html?id=${child.id}" 
                       class="inline-block px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-medium rounded-lg hover:shadow transition">
                        Voir la progression
                    </a>
                </div>
            </div>
        `).join('');

        // Ajouter les événements pour les boutons d'édition
        document.querySelectorAll('.edit-child-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const childId = e.currentTarget.dataset.childId;
                this.editChild(childId);
            });
        });
    }

    updateRecentActivities() {
        const activitiesTable = document.getElementById('activities-table');
        if (!activitiesTable || !this.recentActivities) return;

        const tbody = activitiesTable.querySelector('tbody');
        if (!tbody) return;

        tbody.innerHTML = this.recentActivities.map(activity => `
            <tr class="border-b hover:bg-gray-50">
                <td class="py-3">
                    <div class="flex items-center">
                        <div class="w-8 h-8 rounded-full ${activity.activity_type === 'exercise' ? 'bg-blue-100' : 'bg-purple-100'} flex items-center justify-center mr-3">
                            <i class="fas ${activity.activity_type === 'exercise' ? 'fa-calculator text-blue-600' : 'fa-video text-purple-600'}"></i>
                        </div>
                        <span class="font-medium">${activity.childName}</span>
                    </div>
                </td>
                <td class="py-3">
                    <div class="font-medium">${activity.activity_title}</div>
                    <div class="text-sm text-gray-600">${activity.activity_type === 'exercise' ? 'Exercice' : 'Vidéo'}</div>
                </td>
                <td class="py-3">
                    ${activity.score !== null ? `
                        <span class="px-3 py-1 rounded-full text-sm font-medium 
                            ${activity.score >= 16 ? 'bg-green-100 text-green-800' : 
                              activity.score >= 10 ? 'bg-yellow-100 text-yellow-800' : 
                              'bg-red-100 text-red-800'}">
                            ${activity.score}/20
                        </span>
                    ` : '—'}
                </td>
                <td class="py-3 text-gray-600">
                    ${formatDate(activity.activity_date)}
                </td>
            </tr>
        `).join('');
    }

    updateSubscriptionStatus() {
        const subscriptionEl = document.getElementById('subscription-status');
        if (!subscriptionEl || !this.stats?.profile) return;

        const profile = this.stats.profile;
        const now = new Date();
        const trialEnd = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;

        let statusHTML = '';
        
        if (profile.subscription_status === 'trial' && trialEnd && trialEnd > now) {
            const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
            statusHTML = `
                <div class="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl p-4">
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="font-bold text-lg">Essai gratuit actif</div>
                            <div class="text-green-100">${daysLeft} jours restants</div>
                        </div>
                        <div class="text-right">
                            <div class="text-2xl font-bold capitalize">${profile.subscription_tier || 'excellence'}</div>
                            <div class="text-sm text-green-100">Formule</div>
                        </div>
                    </div>
                </div>
            `;
        } else if (profile.subscription_status === 'active') {
            statusHTML = `
                <div class="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl p-4">
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="font-bold text-lg">Abonnement actif</div>
                            <div class="text-blue-100">Toutes les fonctionnalités débloquées</div>
                        </div>
                        <div class="text-right">
                            <div class="text-2xl font-bold capitalize">${profile.subscription_tier || 'excellence'}</div>
                            <div class="text-sm text-blue-100">Formule</div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            statusHTML = `
                <div class="bg-gradient-to-r from-gray-500 to-gray-700 text-white rounded-xl p-4">
                    <div class="text-center">
                        <div class="font-bold text-lg mb-2">Aucun abonnement actif</div>
                        <a href="tarifs.html" class="inline-block px-6 py-2 bg-white text-gray-800 font-bold rounded-lg hover:shadow transition">
                            Découvrir les formules
                        </a>
                    </div>
                </div>
            `;
        }

        subscriptionEl.innerHTML = statusHTML;
    }

    async showAddChildModal() {
        // Vérifier si le modal existe déjà
        if (document.getElementById('add-child-modal')) {
            return;
        }

        const modalHTML = `
            <div id="add-child-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div class="bg-white rounded-2xl p-6 max-w-md w-full">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-2xl font-bold text-gray-900">Ajouter un enfant</h3>
                        <button type="button" class="text-gray-500 hover:text-gray-700 close-modal">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>
                    
                    <form id="add-child-form" class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Prénom *</label>
                                <input type="text" id="child-first-name" required
                                       class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Nom *</label>
                                <input type="text" id="child-last-name" required
                                       class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Date de naissance</label>
                            <input type="date" id="child-birth-date"
                                   class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Niveau scolaire *</label>
                            <select id="child-school-level" required
                                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                <option value="">Sélectionnez un niveau</option>
                                <option value="CP">CP</option>
                                <option value="CE1">CE1</option>
                                <option value="CE2">CE2</option>
                                <option value="CM1">CM1</option>
                                <option value="CM2">CM2</option>
                                <option value="6eme">6ème</option>
                                <option value="5eme">5ème</option>
                                <option value="4eme">4ème</option>
                                <option value="3eme">3ème</option>
                                <option value="2nde">2nde</option>
                                <option value="1ere">1ère</option>
                                <option value="Terminale">Terminale</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Établissement (optionnel)</label>
                            <input type="text" id="child-school-name"
                                   class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        
                        <div class="flex gap-3 pt-4">
                            <button type="submit"
                                    class="flex-1 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold rounded-lg hover:shadow-lg transition">
                                Ajouter l'enfant
                            </button>
                            <button type="button" class="close-modal flex-1 py-3 border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition">
                                Annuler
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Ajouter les événements
        const form = document.getElementById('add-child-form');
        const closeButtons = document.querySelectorAll('.close-modal');
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.submitAddChildForm();
        });
        
        closeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeModal();
            });
        });
    }

    closeModal() {
        const modal = document.getElementById('add-child-modal');
        if (modal) {
            modal.remove();
        }
    }

    async submitAddChildForm() {
        try {
            const formData = {
                firstName: document.getElementById('child-first-name').value.trim(),
                lastName: document.getElementById('child-last-name').value.trim(),
                birthDate: document.getElementById('child-birth-date').value,
                schoolLevel: document.getElementById('child-school-level').value,
                schoolName: document.getElementById('child-school-name').value.trim()
            };

            // Validation supplémentaire
            if (!formData.firstName || !formData.lastName || !formData.schoolLevel) {
                this.showError('Veuillez remplir tous les champs obligatoires');
                return;
            }

            this.showLoading('Ajout en cours...');
            
            const result = await addChild(this.user.id, formData);
            
            if (result.success) {
                this.closeModal();
                await this.refreshData();
                this.showSuccess('Enfant ajouté avec succès!');
            } else {
                throw new Error(result.error || 'Erreur inconnue');
            }

        } catch (error) {
            console.error('Erreur ajout enfant:', error);
            this.showError('Erreur lors de l\'ajout de l\'enfant: ' + error.message);
        }
    }

    async editChild(childId) {
        console.log('Édition enfant:', childId);
        // À implémenter selon vos besoins
        alert('Fonction d\'édition à implémenter');
    }

    async refreshData() {
        try {
            await this.loadDashboardData();
            this.updateUI();
            if (this.progressChart) this.progressChart.destroy();
            if (this.subjectChart) this.subjectChart.destroy();
            this.initCharts();
            this.showSuccess('Données rafraîchies!');
        } catch (error) {
            this.showError('Erreur rafraîchissement: ' + error.message);
        }
    }

    showLoading(message = 'Chargement...') {
        let loadingEl = document.getElementById('dashboard-loading');
        
        if (!loadingEl) {
            loadingEl = document.createElement('div');
            loadingEl.id = 'dashboard-loading';
            loadingEl.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
            loadingEl.innerHTML = `
                <div class="bg-white rounded-xl p-8 text-center">
                    <div class="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p class="text-gray-700 font-medium">${message}</p>
                </div>
            `;
            document.body.appendChild(loadingEl);
        }
    }

    hideLoading() {
        const loadingEl = document.getElementById('dashboard-loading');
        if (loadingEl) {
            loadingEl.remove();
        }
    }

    showError(message) {
        this.hideLoading();
        
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
            errorEl.classList.add('opacity-0', 'transition-opacity', 'duration-300');
            setTimeout(() => errorEl.remove(), 300);
        }, 5000);
    }

    showSuccess(message) {
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
            successEl.classList.add('opacity-0', 'transition-opacity', 'duration-300');
            setTimeout(() => successEl.remove(), 300);
        }, 3000);
    }
}

// Initialiser le dashboard
let dashboardManager;
document.addEventListener('DOMContentLoaded', () => {
    dashboardManager = new DashboardManager();
    window.dashboardManager = dashboardManager;
});