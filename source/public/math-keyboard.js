/*!
 * math-keyboard-field.js
 * -----------------------------------------------------------------------
 * רכיב עצמאי לשימוש חוזר: שדה קלט לכתיב מתמטי + סרגל כלים לחזקות, שברים,
 * שורשים וסוגריים. מבוסס על ספריית MathLive (בקוד פתוח, בלי מפתח/שרת),
 * שדואגת לכך שהביטוי ייראה כמו בספר לימוד אמיתי - שבר עם קו שבר אמיתי,
 * שורש עם קו עליון שמתארך לפי מה שמתחתיו, סוגריים שמתגבהים לפי התוכן וכו'.
 *
 * שימוש:
 *   <script src="math-keyboard.js"></script>
 *   <math-keyboard-field placeholder="הזן ביטוי"></math-keyboard-field>
 *
 *   const field = document.querySelector('math-keyboard-field');
 *   field.value                      // LaTeX, למשל "\\frac{1}{2}"
 *   field.getValue('ascii-math')      // ייצוג טקסטואלי, למשל "1/2"
 *   field.addEventListener('mkf-change', e => console.log(e.detail.latex));
 *
 * MathLive נטען מקומית מתוך חבילת האתר, כך שהמקלדת אינה תלויה ב-CDN חיצוני.
 * -----------------------------------------------------------------------
 */
(function () {
  if (window.customElements && window.customElements.get('math-keyboard-field')) {
    return; // כבר נטען פעם אחת בעמוד - לא צריך להגדיר מחדש
  }

  // --- טעינת MathLive פעם אחת בלבד, גם אם יש כמה רכיבים בעמוד ---
  let mathLiveReady = null;
  function loadMathLive() {
    if (!mathLiveReady) {
      mathLiveReady = import('./mathlive/mathlive.min.mjs')
        .then((module) => {
          if (module.MathfieldElement) {
            // The path is resolved relative to mathlive.min.mjs itself.
            module.MathfieldElement.fontsDirectory = './fonts';
            module.MathfieldElement.soundsDirectory = null;
          }
          return module;
        })
        .catch((err) => {
          mathLiveReady = null; // מאפשר ניסיון חוזר אם הטעינה נכשלה
          throw err;
        });
    }
    return mathLiveReady;
  }

  // --- כפתורי סרגל הכלים: כל כפתור מכניס תבנית LaTeX עם "placeholder" ---
  // \placeholder{} יוצר "חור" מקווקו שהתלמיד יכול לעבור אליו עם Tab/חצים.
  const TOOLBAR_GROUPS = [
    {
      id: 'numbers',
      title: 'מספרים',
      buttons: [
        { label: '7', title: 'שבע', insert: '7' },
        { label: '8', title: 'שמונה', insert: '8' },
        { label: '9', title: 'תשע', insert: '9' },
        { label: '4', title: 'ארבע', insert: '4' },
        { label: '5', title: 'חמש', insert: '5' },
        { label: '6', title: 'שש', insert: '6' },
        { label: '1', title: 'אחת', insert: '1' },
        { label: '2', title: 'שתיים', insert: '2' },
        { label: '3', title: 'שלוש', insert: '3' },
        { label: '0', title: 'אפס', insert: '0' },
        { label: '.', title: 'נקודה עשרונית', insert: '.' },
        { label: '=', title: 'שווה', insert: '=' },
      ],
    },
    {
      id: 'operations',
      title: 'פעולות',
      buttons: [
        { label: '+', title: 'חיבור', insert: '+' },
        { label: '−', title: 'חיסור', insert: '-' },
        { label: '×', title: 'כפל', insert: '\\times' },
        { label: '÷', title: 'חילוק', insert: '\\div' },
      ],
    },
    {
      id: 'variables',
      title: 'משתנים',
      buttons: [
        { label: 'x', title: 'המשתנה x', insert: 'x' },
        { label: 'y', title: 'המשתנה y', insert: 'y' },
      ],
    },
    {
      id: 'quick',
      title: 'פעולות נפוצות',
      buttons: [
        { label: 'x²', title: 'בריבוע', insert: '^{2}' },
        { label: '√x', title: 'שורש ריבועי', insert: '\\sqrt{\\placeholder{}}' },
        { label: '|x|', title: 'ערך מוחלט', insert: '\\left|\\placeholder{}\\right|' },
        { label: 'π', title: 'פאי', insert: '\\pi' },
        { label: 'xₙ', title: 'כתב תחתי', insert: '_{\\placeholder{}}' },
        { label: '( )', title: 'סוגריים', insert: '(\\placeholder{})' },
        { label: '±', title: 'פלוס־מינוס', insert: '\\pm' },
      ],
    },
    {
      id: 'structures',
      title: 'הכנסת מבנים',
      buttons: [
        { label: 'a⁄b', title: 'שבר', insert: '\\frac{\\placeholder{}}{\\placeholder{}}' },
        { label: '1 a⁄b', title: 'שבר מעורב', insert: '\\placeholder{}\\frac{\\placeholder{}}{\\placeholder{}}' },
        { label: 'xⁿ', title: 'חזקה כללית', insert: '^{\\placeholder{}}' },
        { label: 'ⁿ√x', title: 'שורש מסדר כללי', insert: '\\sqrt[\\placeholder{}]{\\placeholder{}}' },
      ],
    },
    {
      id: 'editing',
      title: 'עריכה',
      buttons: [
        { label: '◂', title: 'סמן שמאלה', command: 'moveToPreviousChar' },
        { label: '▸', title: 'סמן ימינה', command: 'moveToNextChar' },
        { label: '⌫', title: 'מחיקה', command: 'deleteBackward' },
        { label: 'נקה', title: 'ניקוי השדה', clear: true, danger: true },
      ],
    },
  ];

  const ADVANCED_GROUPS = [
    {
      id: 'advanced-functions',
      title: 'פונקציות ולוגריתמים',
      buttons: [
        { label: 'exp', title: 'פונקציה מעריכית', insert: '\\exp(\\placeholder{})' },
        { label: 'ln', title: 'לוגריתם טבעי', insert: '\\ln(\\placeholder{})' },
        { label: 'log', title: 'לוגריתם בבסיס 10', insert: '\\log(\\placeholder{})' },
        { label: 'logₐ', title: 'לוגריתם בבסיס כללי', insert: '\\log_{\\placeholder{}}(\\placeholder{})' },
      ],
    },
    {
      id: 'advanced-trig',
      title: 'פונקציות טריגונומטריות',
      buttons: [
        { label: 'sin', title: 'סינוס', insert: '\\sin(\\placeholder{})' },
        { label: 'cos', title: 'קוסינוס', insert: '\\cos(\\placeholder{})' },
        { label: 'tan', title: 'טנגנס', insert: '\\tan(\\placeholder{})' },
        { label: 'csc', title: 'קוסקנס', insert: '\\csc(\\placeholder{})' },
        { label: 'sec', title: 'סקנס', insert: '\\sec(\\placeholder{})' },
        { label: 'cot', title: 'קוטנגנס', insert: '\\cot(\\placeholder{})' },
      ],
    },
    {
      id: 'advanced-inverse-trig',
      title: 'טריגונומטריה הפוכה',
      buttons: [
        { label: 'sin⁻¹', title: 'ארק־סינוס', insert: '\\arcsin(\\placeholder{})' },
        { label: 'cos⁻¹', title: 'ארק־קוסינוס', insert: '\\arccos(\\placeholder{})' },
        { label: 'tan⁻¹', title: 'ארק־טנגנס', insert: '\\arctan(\\placeholder{})' },
        { label: 'csc⁻¹', title: 'ארק־קוסקנס', insert: '\\operatorname{arccsc}(\\placeholder{})' },
        { label: 'sec⁻¹', title: 'ארק־סקנס', insert: '\\operatorname{arcsec}(\\placeholder{})' },
        { label: 'cot⁻¹', title: 'ארק־קוטנגנס', insert: '\\operatorname{arccot}(\\placeholder{})' },
      ],
    },
    {
      id: 'advanced-calculus',
      title: 'חשבון דיפרנציאלי ואינטגרלי',
      buttons: [
        { label: 'd⁄dx', title: 'נגזרת', insert: '\\frac{d}{dx}(\\placeholder{})' },
        { label: "f′", title: 'סימון נגזרת', insert: "f'(\\placeholder{})" },
        { label: '∫', title: 'אינטגרל', insert: '\\int_{\\placeholder{}}^{\\placeholder{}} \\placeholder{}\\,dx' },
        { label: 'Σ', title: 'סכום', insert: '\\sum_{\\placeholder{}}^{\\placeholder{}} \\placeholder{}' },
        { label: 'Π', title: 'מכפלה', insert: '\\prod_{\\placeholder{}}^{\\placeholder{}} \\placeholder{}' },
      ],
    },
    {
      id: 'advanced-matrices',
      title: 'מטריצות',
      buttons: [
        { label: '2×2', title: 'מטריצה 2 על 2', insert: '\\begin{bmatrix}\\placeholder{}&\\placeholder{}\\\\\\placeholder{}&\\placeholder{}\\end{bmatrix}' },
        { label: '3×3', title: 'מטריצה 3 על 3', insert: '\\begin{bmatrix}\\placeholder{}&\\placeholder{}&\\placeholder{}\\\\\\placeholder{}&\\placeholder{}&\\placeholder{}\\\\\\placeholder{}&\\placeholder{}&\\placeholder{}\\end{bmatrix}' },
        { label: '|2×2|', title: 'דטרמיננטה 2 על 2', insert: '\\begin{vmatrix}\\placeholder{}&\\placeholder{}\\\\\\placeholder{}&\\placeholder{}\\end{vmatrix}' },
        { label: 'וקטור', title: 'וקטור עמודה', insert: '\\begin{pmatrix}\\placeholder{}\\\\\\placeholder{}\\end{pmatrix}' },
      ],
    },
  ];

  const STYLE = `
    :host {
      display: inline-block;
      width: 100%;
      --mkf-border: #d1d5db;
      --mkf-border-focus: #2563eb;
      --mkf-bg: #ffffff;
      --mkf-radius: 10px;
      --mkf-btn-bg: #f3f4f6;
      --mkf-btn-bg-hover: #e5e7eb;
      --mkf-btn-bg-active: #dbeafe;
      --mkf-btn-fg: #111827;
      --mkf-gap: 6px;
      font-family: "Latin Modern Math", system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
    }
    .mkf-wrap {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      box-sizing: border-box;
    }
    .mkf-field-box {
      direction: ltr;
      unicode-bidi: isolate;
      border: 2px solid var(--mkf-border);
      border-radius: var(--mkf-radius);
      background: var(--mkf-bg);
      padding: 6px 10px;
      transition: border-color 0.15s ease;
    }
    .mkf-field-box.mkf-focused {
      border-color: var(--mkf-border-focus);
    }
    math-field {
      display: block;
      width: 100%;
      min-height: 2.2em;
      font-size: 1.25rem;
      border: none;
      font-family: "Latin Modern Math", serif;
      --caret-color: var(--mkf-border-focus, #2563eb);
    }
    math-field::part(virtual-keyboard-toggle) {
      display: none; /* אנחנו מציגים סרגל משלנו במקום המקלדת המובנית */
    }
    .mkf-toolbar {
      direction: ltr;
      display: grid;
      grid-template-columns: minmax(210px, 1.18fr) minmax(66px, .36fr) minmax(94px, .52fr) minmax(185px, 1fr) minmax(185px, 1fr);
      grid-template-areas:
        "numbers operations variables quick structures"
        "advanced advanced advanced advanced advanced"
        "editing editing editing editing editing";
      gap: 10px;
      padding: 10px;
      border: 1px solid var(--mkf-border);
      border-radius: 14px;
      background: #eef1f4;
    }
    .mkf-group {
      direction: rtl;
      min-width: 0;
      padding: 9px;
      border: 1px solid #d7dce2;
      border-radius: 11px;
      background: #fff;
    }
    .mkf-group[data-group="numbers"] { grid-area: numbers; }
    .mkf-group[data-group="operations"] { grid-area: operations; }
    .mkf-group[data-group="variables"] { grid-area: variables; }
    .mkf-group[data-group="quick"] { grid-area: quick; }
    .mkf-group[data-group="structures"] { grid-area: structures; }
    .mkf-group[data-group="editing"] { grid-area: editing; }
    .mkf-group-title {
      margin: 0 0 8px;
      color: #4b5563;
      font-size: .78rem;
      font-weight: 750;
      text-align: right;
    }
    .mkf-group-buttons {
      direction: ltr;
      display: grid;
      grid-template-columns: repeat(2, minmax(48px, 1fr));
      gap: var(--mkf-gap);
    }
    .mkf-group[data-group="numbers"] .mkf-group-buttons {
      grid-template-columns: repeat(3, minmax(48px, 1fr));
    }
    .mkf-group[data-group="operations"] .mkf-group-buttons {
      grid-template-columns: 1fr;
    }
    .mkf-group[data-group="variables"] .mkf-group-buttons {
      grid-template-columns: 1fr;
    }
    .mkf-group[data-group="editing"] .mkf-group-buttons {
      grid-template-columns: repeat(4, minmax(58px, 1fr));
    }
    .mkf-btn {
      min-width: 42px;
      height: 40px;
      padding: 0 10px;
      border: 1px solid var(--mkf-border);
      border-radius: 8px;
      background: #f7f8fa;
      color: var(--mkf-btn-fg);
      font-size: 1.05rem;
      line-height: 1;
      cursor: pointer;
      direction: ltr;
      unicode-bidi: isolate;
      user-select: none;
      touch-action: manipulation;
    }
    .mkf-btn:hover {
      background: var(--mkf-btn-bg-hover);
      transform: translateY(-1px);
    }
    .mkf-btn:active {
      background: var(--mkf-btn-bg-active);
    }
    .mkf-btn:focus-visible {
      outline: 2px solid var(--mkf-border-focus);
      outline-offset: 1px;
    }
    .mkf-btn--number {
      min-height: 48px;
      background: #ffffff;
      font-size: 1.18rem;
      font-weight: 700;
      box-shadow: 0 1px 2px #00000012;
    }
    .mkf-btn--operation {
      min-height: 48px;
      background: #e8f1ff;
      color: #174f96;
      font-size: 1.28rem;
      font-weight: 800;
    }
    .mkf-btn--advanced {
      background: #f2edff;
      color: #52348c;
    }
    .mkf-btn--danger { color: #a12626; background: #fff0f0; }
    .mkf-advanced {
      grid-area: advanced;
      direction: rtl;
      min-width: 0;
    }
    .mkf-advanced-toggle {
      width: 100%;
      height: 42px;
      border: 1px solid #b9a9e2;
      border-radius: 10px;
      background: #ebe4ff;
      color: #4f3388;
      font-weight: 800;
      cursor: pointer;
    }
    .mkf-advanced-toggle:hover { background: #e2d8ff; }
    .mkf-advanced-toggle:focus-visible {
      outline: 2px solid var(--mkf-border-focus);
      outline-offset: 2px;
    }
    .mkf-advanced-panel {
      display: none;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-top: 8px;
      padding: 9px;
      border: 1px solid #d7d0e8;
      border-radius: 11px;
      background: #faf8ff;
    }
    .mkf-advanced-panel.mkf-open { display: grid; }
    .mkf-advanced-panel .mkf-group { padding: 8px; }
    .mkf-advanced-panel .mkf-group-buttons {
      grid-template-columns: repeat(3, minmax(48px, 1fr));
    }
    @media (max-width: 820px) {
      .mkf-toolbar {
        grid-template-columns: 1.25fr .42fr .58fr 1fr;
        grid-template-areas:
          "numbers operations variables quick"
          "structures structures structures structures"
          "advanced advanced advanced advanced"
          "editing editing editing editing";
      }
      .mkf-advanced-panel { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 470px) {
      .mkf-toolbar {
        grid-template-columns: 1fr .38fr .52fr;
        grid-template-areas:
          "numbers operations variables"
          "quick quick quick"
          "structures structures structures"
          "advanced advanced advanced"
          "editing editing editing";
      }
      .mkf-advanced-panel { grid-template-columns: 1fr; }
      .mkf-group[data-group="editing"] .mkf-group-buttons {
        grid-template-columns: repeat(4, minmax(48px, 1fr));
      }
    }
  `;

  class MathKeyboardField extends HTMLElement {
    static get observedAttributes() {
      return ['placeholder', 'readonly', 'value'];
    }

    constructor() {
      super();
      this._root = this.attachShadow({ mode: 'open' });
      this._built = false;
      this._pendingValue = null;
    }

    connectedCallback() {
      if (!this._built) {
        this._built = true;
        this._build();
      }
    }

    async _build() {
      const style = document.createElement('style');
      style.textContent = STYLE;

      const wrap = document.createElement('div');
      wrap.className = 'mkf-wrap';

      const fieldBox = document.createElement('div');
      fieldBox.className = 'mkf-field-box';

      const field = document.createElement('math-field');
      field.setAttribute('dir', 'ltr');
      fieldBox.appendChild(field);

      const toolbar = document.createElement('div');
      toolbar.className = 'mkf-toolbar';
      toolbar.setAttribute('role', 'toolbar');
      toolbar.setAttribute('aria-label', 'סרגל כתיב מתמטי');

      const buildGroup = (groupDef, advanced = false) => {
        const group = document.createElement('section');
        group.className = 'mkf-group';
        group.dataset.group = groupDef.id;

        const heading = document.createElement('h3');
        heading.className = 'mkf-group-title';
        heading.textContent = groupDef.title;

        const buttons = document.createElement('div');
        buttons.className = 'mkf-group-buttons';

        groupDef.buttons.forEach((def) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          const typeClass =
            groupDef.id === 'numbers'
              ? ' mkf-btn--number'
              : groupDef.id === 'operations'
              ? ' mkf-btn--operation'
              : groupDef.id === 'powers' || groupDef.id === 'structures'
              ? ' mkf-btn--advanced'
              : '';
          btn.className =
            'mkf-btn' +
            typeClass +
            (def.danger ? ' mkf-btn--danger' : '');
          btn.textContent = def.label;
          btn.title = def.title;
          btn.setAttribute('aria-label', def.title);
          btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            this._handleToolbarAction(def);
          });
          buttons.appendChild(btn);
        });
        group.appendChild(heading);
        group.appendChild(buttons);
        return group;
      };

      TOOLBAR_GROUPS.filter((groupDef) => groupDef.id !== 'editing').forEach((groupDef) => {
        toolbar.appendChild(buildGroup(groupDef));
      });

      const advanced = document.createElement('section');
      advanced.className = 'mkf-advanced';
      const advancedToggle = document.createElement('button');
      advancedToggle.type = 'button';
      advancedToggle.className = 'mkf-advanced-toggle';
      advancedToggle.textContent = 'מתקדם  ▾';
      advancedToggle.setAttribute('aria-expanded', 'false');
      const advancedPanel = document.createElement('div');
      advancedPanel.className = 'mkf-advanced-panel';
      ADVANCED_GROUPS.forEach((groupDef) => advancedPanel.appendChild(buildGroup(groupDef, true)));
      advancedToggle.addEventListener('click', () => {
        const isOpen = advancedPanel.classList.toggle('mkf-open');
        advancedToggle.textContent = isOpen ? 'מתקדם  ▴' : 'מתקדם  ▾';
        advancedToggle.setAttribute('aria-expanded', String(isOpen));
      });
      advanced.appendChild(advancedToggle);
      advanced.appendChild(advancedPanel);
      toolbar.appendChild(advanced);

      const editingGroup = TOOLBAR_GROUPS.find((groupDef) => groupDef.id === 'editing');
      if (editingGroup) toolbar.appendChild(buildGroup(editingGroup));

      wrap.appendChild(fieldBox);
      wrap.appendChild(toolbar);
      this._root.replaceChildren(style, wrap);

      this._field = field;
      this._fieldBox = fieldBox;

      // תמיכה בתוכן ראשוני: תכונת value, אחרת טקסט פנימי של התג
      const initialValue =
        this._pendingValue != null
          ? this._pendingValue
          : this.getAttribute('value') != null
          ? this.getAttribute('value')
          : this.textContent.trim();

      try {
        await loadMathLive();
      } catch (err) {
        fieldBox.textContent =
          'לא ניתן לטעון את ספריית הכתיב המתמטי (MathLive). יש לבדוק חיבור לאינטרנט.';
        console.error('math-keyboard-field: failed to load MathLive', err);
        return;
      }

      // הגדרות עריכה: סוגריים/מוחלט חכמים שמתגבהים לפי התוכן,
      // ויציאה אוטומטית מחזקה כשמקלידים ספרה אחרי מספר.
      field.smartFence = true;
      field.smartSuperscript = true;
      field.removeExtraneousParentheses = true;
      field.mathVirtualKeyboardPolicy = 'manual'; // מבטל את המקלדת המובנית של MathLive

      if (initialValue) field.value = initialValue;
      if (this.hasAttribute('placeholder')) {
        field.setAttribute('placeholder', '\\text{' + this.getAttribute('placeholder') + '}');
      }
      if (this.hasAttribute('readonly')) {
        field.readOnly = true;
      }

      field.addEventListener('focusin', () => fieldBox.classList.add('mkf-focused'));
      field.addEventListener('focusout', () => fieldBox.classList.remove('mkf-focused'));

      const forward = (type) => (ev) => {
        this.dispatchEvent(
          new CustomEvent('mkf-' + type, {
            bubbles: true,
            composed: true,
            detail: { latex: field.value },
          })
        );
      };
      field.addEventListener('input', forward('input'));
      field.addEventListener('change', forward('change'));

      this.dispatchEvent(new CustomEvent('mkf-ready', { bubbles: true, composed: true }));
    }

    _handleToolbarAction(def) {
      if (!this._field) return;
      this._field.focus();
      if (def.clear) {
        this._field.value = '';
      } else if (def.command) {
        this._field.executeCommand(def.command);
      } else if (def.insert) {
        this._field.insert(def.insert, { selectionMode: 'placeholder' });
      }
      // ה-input/change של MathLive מטופלים כבר דרך המאזינים שהוגדרו למעלה
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (!this._field) {
        if (name === 'value') this._pendingValue = newVal;
        return;
      }
      if (name === 'value' && newVal != null && newVal !== this._field.value) {
        this._field.value = newVal;
      } else if (name === 'placeholder' && newVal != null) {
        this._field.setAttribute('placeholder', '\\text{' + newVal + '}');
      } else if (name === 'readonly') {
        this._field.readOnly = this.hasAttribute('readonly');
      }
    }

    /** LaTeX הנוכחי בשדה */
    get value() {
      return this._field ? this._field.value : this._pendingValue || '';
    }
    set value(v) {
      if (this._field) this._field.value = v;
      else this._pendingValue = v;
    }

    /** ייצוג בפורמט אחר, למשל getValue('ascii-math') */
    getValue(format) {
      return this._field ? this._field.getValue(format) : '';
    }

    focus() {
      if (this._field) this._field.focus();
    }

    /** מחזיר true אם השדה ריק */
    isEmpty() {
      return !this.value || this.value.trim() === '';
    }
  }

  class MathDisplayElement extends HTMLElement {
    static get observedAttributes() { return ['value']; }
    constructor() {
      super();
      this._root = this.attachShadow({ mode: 'open' });
    }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { if (this.isConnected) this._render(); }
    async _render() {
      await loadMathLive();
      const style = document.createElement('style');
      style.textContent = `:host{display:inline-block;direction:ltr;unicode-bidi:isolate;font-family:"Latin Modern Math",serif}math-field{display:inline-block;min-width:0;padding:0;border:0;background:transparent;font-size:inherit;pointer-events:none;--caret-color:transparent}math-field::part(virtual-keyboard-toggle),math-field::part(menu-toggle){display:none}`;
      const field = document.createElement('math-field');
      field.readOnly = true;
      field.value = this.getAttribute('value') || '';
      field.setAttribute('aria-label', 'ביטוי מתמטי');
      this._root.replaceChildren(style, field);
    }
  }

  customElements.define('math-keyboard-field', MathKeyboardField);
  if (!customElements.get('math-display')) customElements.define('math-display', MathDisplayElement);
})();
