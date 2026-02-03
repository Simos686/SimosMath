// payment.js - Logique de paiement
import { supabase } from './supabase-client.js';
import { createSubscriptionSession, startFreeTrial } from './stripe-handler.js';
import { initStripe } from './config.js';

class PaymentManager {
    constructor() {
        this.plan = 'excellence';
        this.period = 'monthly';
        this.stripe = null;
        this.cardElement = null;
        this.initialize();
    }

    async initialize() {
        try {
            // Vérifier si on est sur la page de paiement
            if (!document.getElementById('payment-form')) {
                console.log('Pas sur la page payment');
                return;
            }

            await this.loadPlanDetails();
            this.setupStripe();
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Erreur initialisation payment:', error);
            this.showError('Erreur d\'initialisation du paiement');
        }
    }

    async loadPlanDetails() {
        // Récupérer les paramètres de l'URL
        const urlParams = new URLSearchParams(window.location.search);
        this.plan = urlParams.get('plan') || 'excellence';
        this.period = urlParams.get('period') || 'monthly';

        // Mettre à jour l'interface
        this.updatePlanDisplay();

        // Vérifier l'authentification
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error || !user) {
            window.location.href = `auth.html?redirect=payment&plan=${this.plan}`;
            return;
        }

        this.user = user;

        // Vérifier si l'utilisateur a déjà un abonnement
        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('profile_id', user.id)
            .in('status', ['active', 'trial'])
            .single();

        if (subscription) {
            // Rediriger vers le dashboard
            window.location.href = 'dashboard.html';
        }
    }

    setupStripe() {
        // Initialiser Stripe
        this.stripe = initStripe();
        
        if (!this.stripe) {
            console.error('Stripe non initialisé');
            this.showError('Le service de paiement n\'est pas disponible');
            return;
        }

        // Créer les éléments Stripe
        const elements = this.stripe.elements();
        
        const style = {
            base: {
                color: '#32325d',
                fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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

        this.cardElement = elements.create('card', { 
            style: style,
            hidePostalCode: true 
        });
        
        const cardElementContainer = document.getElementById('card-element');
        if (cardElementContainer) {
            this.cardElement.mount('#card-element');
        }

        // Gérer les erreurs de carte
        this.cardElement.on('change', (event) => {
            const displayError = document.getElementById('card-errors');
            if (displayError) {
                if (event.error) {
                    displayError.textContent = event.error.message;
                    displayError.classList.remove('hidden');
                } else {
                    displayError.textContent = '';
                    displayError.classList.add('hidden');
                }
            }
        });
    }

    setupEventListeners() {
        // Soumission du formulaire de paiement
        const paymentForm = document.getElementById('payment-form');
        if (paymentForm) {
            paymentForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handlePaymentSubmit();
            });
        }

        // Bouton d'essai gratuit
        const trialButton = document.getElementById('trial-button');
        if (trialButton) {
            trialButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleTrialStart();
            });
        }

        // Validation des champs en temps réel
        const formInputs = document.querySelectorAll('#payment-form input[required]');
        formInputs.forEach(input => {
            input.addEventListener('blur', () => {
                this.validateField(input);
            });
            input.addEventListener('input', () => {
                this.clearFieldError(input);
            });
        });
    }

    updatePlanDisplay() {
        const planNames = {
            decouverte: 'Formule Découverte',
            excellence: 'Formule Excellence',
            famille: 'Formule Famille'
        };

        const prices = {
            decouverte: { monthly: '7,99€', yearly: '79,90€' },
            excellence: { monthly: '14,99€', yearly: '149,90€' },
            famille: { monthly: '24,99€', yearly: '249,90€' }
        };

        // Mettre à jour l'affichage
        const planNameEl = document.getElementById('plan-name');
        const planPriceEl = document.getElementById('plan-price');
        const planPeriodEl = document.getElementById('plan-period');
        const savingsEl = document.getElementById('plan-savings');

        if (planNameEl) planNameEl.textContent = planNames[this.plan] || 'Formule Excellence';
        if (planPriceEl) planPriceEl.textContent = prices[this.plan]?.[this.period] || '14,99€';
        if (planPeriodEl) planPeriodEl.textContent = this.period === 'monthly' ? '/ mois' : '/ an';
        
        // Afficher les économies pour l'abonnement annuel
        if (savingsEl && this.period === 'yearly') {
            const monthlyPrice = parseInt(prices[this.plan]?.monthly?.replace(',', '.')) * 12;
            const yearlyPrice = parseInt(prices[this.plan]?.yearly?.replace(',', '.'));
            const savings = monthlyPrice - yearlyPrice;
            if (savings > 0) {
                savingsEl.textContent = `Économisez ${savings.toFixed(2)}€`;
                savingsEl.classList.remove('hidden');
            }
        }
    }

    async handlePaymentSubmit() {
        try {
            this.showLoading('Traitement du paiement...');

            // Valider le formulaire
            if (!this.validateForm()) {
                throw new Error('Veuillez corriger les erreurs du formulaire');
            }

            // Récupérer les informations client
            const formData = {
                firstName: document.getElementById('first-name').value.trim(),
                lastName: document.getElementById('last-name').value.trim(),
                email: document.getElementById('email').value.trim()
            };

            // Créer la session de paiement
            await createSubscriptionSession(
                this.plan,
                this.period,
                formData
            );

        } catch (error) {
            console.error('Erreur paiement:', error);
            this.showError('Erreur lors du paiement: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async handleTrialStart() {
        try {
            this.showLoading('Démarrage de l\'essai...');

            // Valider le formulaire
            if (!this.validateForm()) {
                throw new Error('Veuillez corriger les erreurs du formulaire');
            }

            // Récupérer les informations client
            const formData = {
                firstName: document.getElementById('first-name').value.trim(),
                lastName: document.getElementById('last-name').value.trim(),
                email: document.getElementById('email').value.trim()
            };

            // Démarrer l'essai
            const result = await startFreeTrial(this.plan, formData);
            
            if (result.success) {
                // Rediriger vers la page de succès
                window.location.href = 'payment-success.html?trial=true&plan=' + this.plan;
            } else {
                throw new Error(result.error || 'Erreur lors du démarrage de l\'essai');
            }

        } catch (error) {
            console.error('Erreur essai:', error);
            this.showError('Erreur lors du démarrage de l\'essai: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    validateForm() {
        let isValid = true;
        
        // Validation des champs obligatoires
        const requiredFields = [
            { id: 'first-name', message: 'Le prénom est obligatoire' },
            { id: 'last-name', message: 'Le nom est obligatoire' },
            { id: 'email', message: 'L\'email est obligatoire', email: true }
        ];

        requiredFields.forEach(field => {
            const element = document.getElementById(field.id);
            if (element) {
                const value = element.value.trim();
                
                if (!value) {
                    this.showFieldError(element, field.message);
                    isValid = false;
                } else if (field.email && !this.isValidEmail(value)) {
                    this.showFieldError(element, 'Veuillez entrer un email valide');
                    isValid = false;
                }
            }
        });

        // Validation conditions générales
        const termsCheckbox = document.getElementById('terms');
        if (termsCheckbox && !termsCheckbox.checked) {
            this.showError('Veuillez accepter les conditions générales');
            isValid = false;
        }

        return isValid;
    }

    validateField(field) {
        const value = field.value.trim();
        
        if (field.type === 'email' && value) {
            if (!this.isValidEmail(value)) {
                this.showFieldError(field, 'Veuillez entrer un email valide');
                return false;
            }
        }
        
        if (field.required && !value) {
            const fieldName = field.previousElementSibling?.textContent || 'Ce champ';
            this.showFieldError(field, `${fieldName} est obligatoire`);
            return false;
        }
        
        this.clearFieldError(field);
        return true;
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    showFieldError(input, message) {
        input.classList.add('border-red-500', 'focus:border-red-500', 'focus:ring-red-500');
        
        // Supprimer l'erreur précédente
        this.clearFieldError(input);
        
        // Créer le message d'erreur
        const errorEl = document.createElement('div');
        errorEl.className = 'error-message text-red-500 text-sm mt-1';
        errorEl.textContent = message;
        
        input.parentNode.appendChild(errorEl);
    }

    clearFieldError(input) {
        input.classList.remove('border-red-500', 'focus:border-red-500', 'focus:ring-red-500');
        
        const errorEl = input.parentNode.querySelector('.error-message');
        if (errorEl) {
            errorEl.remove();
        }
    }

    showLoading(message = 'Chargement...') {
        let loadingEl = document.getElementById('payment-loading');
        
        if (!loadingEl) {
            loadingEl = document.createElement('div');
            loadingEl.id = 'payment-loading';
            loadingEl.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
            loadingEl.innerHTML = `
                <div class="bg-white rounded-xl p-8 text-center">
                    <div class="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p class="text-gray-700 font-medium">${message}</p>
                </div>
            `;
            document.body.appendChild(loadingEl);
        } else {
            loadingEl.classList.remove('hidden');
        }
    }

    hideLoading() {
        const loadingEl = document.getElementById('payment-loading');
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

// Initialiser le gestionnaire de paiement
let paymentManager;
document.addEventListener('DOMContentLoaded', () => {
    paymentManager = new PaymentManager();
    window.paymentManager = paymentManager;
});