<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modelValue" class="modal-overlay" @click.self="closeOnOverlay && close()">
        <div class="modal-container" :class="[size, { 'has-icon': icon }]">
          <!-- Close Button -->
          <button v-if="showClose" class="modal-close" @click="close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          <!-- Icon -->
          <div v-if="icon" class="modal-icon" :class="iconType">
            <div class="icon-bg"></div>
            <span v-if="icon.length <= 2" class="icon-emoji">{{ icon }}</span>
            <svg v-else-if="iconType === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <svg v-else-if="iconType === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <svg v-else-if="iconType === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </div>

          <!-- Header -->
          <div v-if="title || $slots.header" class="modal-header">
            <slot name="header">
              <h3>{{ title }}</h3>
              <p v-if="subtitle" class="modal-subtitle">{{ subtitle }}</p>
            </slot>
          </div>

          <!-- Body -->
          <div class="modal-body">
            <slot></slot>
          </div>

          <!-- Footer -->
          <div v-if="$slots.footer || showFooter" class="modal-footer">
            <slot name="footer">
              <button v-if="showCancel" class="btn-cancel" @click="close">
                {{ cancelText }}
              </button>
              <button class="btn-confirm" :class="confirmType" :disabled="confirmDisabled || loading" @click="confirm">
                <span v-if="loading" class="btn-loading"></span>
                <span>{{ confirmText }}</span>
              </button>
            </slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
export default {
  name: 'Modal',
  props: {
    modelValue: Boolean,
    title: String,
    subtitle: String,
    icon: String,
    iconType: { type: String, default: 'success' },
    size: { type: String, default: 'medium' },
    showClose: { type: Boolean, default: true },
    showFooter: { type: Boolean, default: true },
    showCancel: { type: Boolean, default: true },
    cancelText: { type: String, default: '取消' },
    confirmText: { type: String, default: '确认' },
    confirmType: { type: String, default: 'primary' },
    confirmDisabled: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    closeOnOverlay: { type: Boolean, default: true }
  },
  emits: ['update:modelValue', 'confirm', 'cancel'],
  methods: {
    close() {
      this.$emit('update:modelValue', false)
      this.$emit('cancel')
    },
    confirm() {
      this.$emit('confirm')
    }
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 24px;
}

.modal-container {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 24px;
  width: 100%;
  max-height: calc(100vh - 48px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-container.small { max-width: 380px; }
.modal-container.medium { max-width: 480px; }
.modal-container.large { max-width: 600px; }
.modal-container.xlarge { max-width: 800px; }

.modal-container.has-icon {
  text-align: center;
}

.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--text-primary);
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.modal-close:hover {
  background: rgba(255, 107, 107, 0.2);
  border-color: rgba(255, 107, 107, 0.4);
  color: #ff6b6b;
}

.modal-close svg {
  width: 18px;
  height: 18px;
}

.modal-icon {
  position: relative;
  width: 80px;
  height: 80px;
  margin: 32px auto 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-bg {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  opacity: 0.15;
}

.modal-icon.success .icon-bg { background: var(--primary); }
.modal-icon.error .icon-bg { background: #ff6b6b; }
.modal-icon.warning .icon-bg { background: #ffc107; }
.modal-icon.info .icon-bg { background: #4facfe; }

.modal-icon svg {
  width: 40px;
  height: 40px;
  position: relative;
  z-index: 1;
}

.modal-icon.success svg { color: var(--primary); }
.modal-icon.error svg { color: #ff6b6b; }
.modal-icon.warning svg { color: #ffc107; }
.modal-icon.info svg { color: #4facfe; }

.icon-emoji {
  font-size: 40px;
  position: relative;
  z-index: 1;
}

.modal-header {
  padding: 24px 24px 0;
}

.has-icon .modal-header {
  padding-top: 20px;
}

.modal-header h3 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.35rem;
  font-weight: 700;
  margin-bottom: 4px;
}

.modal-subtitle {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid var(--border);
}

.has-icon .modal-footer {
  justify-content: center;
}

.btn-cancel, .btn-confirm {
  flex: 1;
  padding: 14px 24px;
  font-size: 0.95rem;
  font-weight: 600;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.has-icon .btn-cancel,
.has-icon .btn-confirm {
  flex: none;
  min-width: 120px;
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--text-muted);
}

.btn-confirm {
  border: none;
}

.btn-confirm.primary {
  background: var(--gradient-1);
  color: var(--bg-dark);
}

.btn-confirm.danger {
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
  color: #fff;
}

.btn-confirm.warning {
  background: linear-gradient(135deg, #ffc107 0%, #ffb300 100%);
  color: var(--bg-dark);
}

.btn-confirm:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 25px rgba(0, 217, 165, 0.3);
}

.btn-confirm.danger:hover:not(:disabled) {
  box-shadow: 0 8px 25px rgba(255, 107, 107, 0.3);
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-loading {
  width: 18px;
  height: 18px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Animations */
.modal-enter-active {
  animation: modalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-leave-active {
  animation: modalOut 0.25s cubic-bezier(0.4, 0, 1, 1);
}

.modal-enter-active .modal-container {
  animation: scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-leave-active .modal-container {
  animation: scaleOut 0.25s cubic-bezier(0.4, 0, 1, 1);
}

@keyframes modalIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes modalOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes scaleOut {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }
}
</style>
