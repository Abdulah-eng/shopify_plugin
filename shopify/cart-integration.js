/**
 * 4D Design Graphics – Shopify Cart Integration
 * Handles AJAX cart API, line item properties, and checkout flow
 */

(function () {
  'use strict';

  const shopifyCartIntegration = {
    /**
     * Add a configured product to the Shopify cart
     * @param {Object} options
     * @param {string} options.variantId - Shopify variant ID
     * @param {number} options.quantity - Quantity (default: 1)
     * @param {Object} options.properties - Line item properties (customization details)
     * @param {string} [options.previewDataUrl] - Base64 screenshot for reference
     */
    async addToCart({ variantId, quantity = 1, properties = {}, previewDataUrl }) {
      if (!variantId || variantId === 'YOUR_VARIANT_ID') {
        throw new Error('Shopify variant ID not configured. Please update config/models.json with your product variant IDs.');
      }

      // Build clean properties (remove empty values)
      const cleanProps = {};
      Object.entries(properties).forEach(([key, val]) => {
        if (val && val !== '—' && val !== '') {
          cleanProps[key] = String(val);
        }
      });

      // Add screenshot note (base64 is too large for line props, store as short ref)
      cleanProps['_configurator_version'] = '4D-3D-v1.0';
      cleanProps['_timestamp'] = new Date().toISOString().split('T')[0];

      const payload = {
        id: variantId,
        quantity,
        properties: cleanProps,
      };

      if (window.parent !== window) {
        // Send cart payload to Shopify parent — parent will confirm via 4d:cart-added or 4d:cart-error
        window.parent.postMessage({
          type: '4d:trigger-add-to-cart',
          payload: payload
        }, '*');
        // Don't show success modal here — wait for parent to confirm
      } else {
        // Standalone / demo mode: show success modal immediately
        const modal = document.getElementById('success-modal');
        if (modal) modal.classList.remove('hidden');
      }

      return payload;
    },

    /**
     * Get current cart contents
     */
    async getCart() {
      const resp = await fetch('/cart.js', {
        headers: { 'Accept': 'application/json' },
      });
      if (!resp.ok) throw new Error('Could not fetch cart');
      return resp.json();
    },

    /**
     * Update cart count badge in theme header
     */
    async _updateCartCount() {
      try {
        const cart = await this.getCart();
        const count = cart.item_count;
        // Common Shopify theme cart count selectors
        const selectors = [
          '.cart-count', '.cart-item-count', '[data-cart-count]',
          '#cart-count', '.header__cart-count', '.js-cart-count',
        ];
        selectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.textContent = count;
          });
        });
      } catch (e) {
        // Silently fail – not critical
      }
    },

    /**
     * Build a human-readable configuration summary string
     * (useful for order notes or email templates)
     */
    buildSummaryText(state, modelConfig) {
      if (!state || !modelConfig) return '';
      const lines = [
        `=== 4D DESIGN GRAPHICS – CUSTOM ORDER ===`,
        `Model: ${modelConfig.name}`,
        `Year: ${state.year || 'N/A'}`,
        `Plastics: ${state.plastics || 'N/A'}`,
        `Front Fender: ${state.frontFender || 'N/A'}`,
        `Print Base: ${state.printBase || 'N/A'}`,
        `Laminate: ${state.laminate || 'N/A'}`,
        `Wheels Graphics: ${state.wheelsGraphics || 'N/A'}`,
        `--- PERSONALIZATION ---`,
        `Rider Name: ${state.riderName || 'N/A'}`,
        `Rider Number: ${state.riderNumber || 'N/A'}`,
        `Font Style: ${state.nameFont || 'N/A'}`,
        `Logo: ${state.logo || 'None'}`,
        `--- COLORS ---`,
        ...modelConfig.colorZones.map(z =>
          `${z.name}: ${state.colors[z.id] || z.default}`
        ),
        `===========================================`,
      ];
      return lines.join('\n');
    },
  };

  // Expose globally
  window.shopifyCartIntegration = shopifyCartIntegration;

  // Handle postMessage from parent Shopify window (iframe mode)
  window.addEventListener('message', (event) => {
    // Validate origin in production (replace with your Shopify domain)
    // if (event.origin !== 'https://4ddesignsgraphics.com') return;

    const { type, data } = event.data || {};

    if (type === '4d:get-config') {
      // Parent is requesting current configurator state
      const state = window.configurator4D?.state;
      event.source?.postMessage({
        type: '4d:config-response',
        data: state,
      }, event.origin);
    }

    if (type === '4d:add-to-cart') {
      // Parent is triggering cart add
      window.configurator4D?.addToCart?.();
    }

    if (type === '4d:cart-added') {
      // Shopify parent confirmed cart was successfully updated — show success modal
      const modal = document.getElementById('success-modal');
      if (modal) modal.classList.remove('hidden');
      const btn = document.getElementById('btn-add-cart');
      if (btn) btn.classList.remove('loading');
    }

    if (type === '4d:cart-error') {
      // Shopify parent reported a cart error
      const errorMsg = (data && data.error) ? data.error : 'Could not add to cart';
      window.configurator4D?.showToast?.('⚠ ' + errorMsg, 'error');
      const btn = document.getElementById('btn-add-cart');
      if (btn) btn.classList.remove('loading');
    }
  });

  // Notify parent that configurator is ready
  if (window.parent !== window) {
    window.parent.postMessage({ type: '4d:ready' }, '*');
  }

})();
