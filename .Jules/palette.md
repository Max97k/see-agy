## 2024-07-26 - Added Modal Keyboard and Screen Reader Accessibility
**Learning:** React modals in this app (like the Directory Switcher) previously lacked standard accessibility bindings such as keyboard Escape handling, proper dialog ARIA roles, and auto-focus for text inputs, making them tedious to use for keyboard navigators and invisible to screen readers.
**Action:** When implementing custom modal components, always apply `role="dialog"`, `aria-modal="true"`, an Escape keydown event listener, and use `autoFocus` on the primary input field to create a seamless user experience.
