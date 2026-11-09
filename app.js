/**
 * İşletme Vize Hazırlık Platformu - 100 Tam Puan Uygulaması
 * Full Client-Side Application Logic (No external CDN required)
 */

(function() {
  'use strict';

  // --- Theme Manager ---
  function initTheme() {
    const savedTheme = localStorage.getItem('isletme_theme') || 
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeToggleIcons(savedTheme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('isletme_theme', next);
    updateThemeToggleIcons(next);
  }

  function updateThemeToggleIcons(theme) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    if (theme === 'dark') {
      btn.innerHTML = '☀️ Aydınlık Mod';
    } else {
      btn.innerHTML = '🌙 Koyu Mod';
    }
  }

  // --- Confetti Engine ---
  function launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        velX: (Math.random() - 0.5) * 4,
        velY: Math.random() * 5 + 3,
        rot: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 8
      });
    }

    let frame = 0;
    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.velX;
        p.y += p.velY;
        p.rot += p.rotSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });

      frame++;
      if (frame < 180) {
        requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    render();
  }

  // --- Local Storage Progress Helper ---
  function getCourseStats(courseId) {
    const data = localStorage.getItem(`isletme_stats_${courseId}`);
    if (!data) {
      return { lastScore: null, bestScore: null, totalExams: 0, masteredCards: [] };
    }
    try {
      return JSON.parse(data);
    } catch(e) {
      return { lastScore: null, bestScore: null, totalExams: 0, masteredCards: [] };
    }
  }

  function saveCourseExamResult(courseId, score) {
    const stats = getCourseStats(courseId);
    stats.lastScore = score;
    stats.bestScore = stats.bestScore === null ? score : Math.max(stats.bestScore, score);
    stats.totalExams = (stats.totalExams || 0) + 1;
    localStorage.setItem(`isletme_stats_${courseId}`, JSON.stringify(stats));
  }

  // --- Course Application State ---
  window.IsletmeApp = {
    course: null,
    exam: {
      questions: [],
      currentIndex: 0,
      userAnswers: {}, // { qIndex: 'A' }
      flagged: {}, // { qIndex: true }
      timerInterval: null,
      secondsLeft: 30 * 60,
      isFinished: false,
      applyPenalty: false // 4 yanlış 1 doğru
    },
    flashcards: {
      currentIndex: 0,
      list: [],
      isFlipped: false
    },

    init: function(courseId) {
      initTheme();
      const themeBtn = document.getElementById('theme-toggle');
      if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

      if (!courseId) {
        // Portal Homepage
        this.initPortal();
        return;
      }

      this.course = COURSE_DATABASE[courseId];
      if (!this.course) return;

      this.initTabs();
      this.initExamSimulator();
      this.initStudyNotes();
      this.initPracticeMode();
      this.initFlashcards();
    },

    initPortal: function() {
      // Update stats on portal page
      let totalExamsAll = 0;
      let totalMasteredCardsAll = 0;
      const courseKeys = ['isletme', 'hukuk', 'iktisat', 'davranis'];

      courseKeys.forEach(key => {
        const stats = getCourseStats(key);
        totalExamsAll += stats.totalExams || 0;
        if (stats.masteredCards) totalMasteredCardsAll += stats.masteredCards.length;

        const scoreEl = document.getElementById(`score-${key}`);
        if (scoreEl && stats.bestScore !== null) {
          scoreEl.textContent = `En İyi Skor: ${stats.bestScore}/100`;
          scoreEl.className = 'stat-value text-success';
        }
      });

      const totalExamsEl = document.getElementById('total-exams-count');
      if (totalExamsEl) totalExamsEl.textContent = totalExamsAll;
    },

    // --- Tabs Navigation ---
    initTabs: function() {
      const tabBtns = document.querySelectorAll('.tab-btn');
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const target = btn.getAttribute('data-tab');
          tabBtns.forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
          
          btn.classList.add('active');
          const panel = document.getElementById(`panel-${target}`);
          if (panel) panel.classList.add('active');
        });
      });
    },

    // --- Exam Simulator Engine ---
    initExamSimulator: function() {
      this.setupExamQuestions();
      this.renderExamView();
      this.startExamTimer();
    },

    setupExamQuestions: function() {
      const allQ = this.course.allQuestions;
      // Group by units 1..4
      const byUnit = { 1: [], 2: [], 3: [], 4: [] };
      allQ.forEach(q => {
        if (byUnit[q.unitId]) byUnit[q.unitId].push(q);
      });

      // Sample 5 questions randomly from each unit -> 20 questions total
      const selected = [];
      for (let u = 1; u <= 4; u++) {
        const pool = [...byUnit[u]];
        // Fisher-Yates shuffle
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        selected.push(...pool.slice(0, 5));
      }

      this.exam.questions = selected;
      this.exam.currentIndex = 0;
      this.exam.userAnswers = {};
      this.exam.flagged = {};
      this.exam.secondsLeft = 30 * 60;
      this.exam.isFinished = false;
    },

    startExamTimer: function() {
      if (this.exam.timerInterval) clearInterval(this.exam.timerInterval);
      const timerEl = document.getElementById('exam-timer');
      if (!timerEl) return;

      this.exam.timerInterval = setInterval(() => {
        if (this.exam.secondsLeft <= 0) {
          clearInterval(this.exam.timerInterval);
          this.finishExam(true);
          return;
        }
        this.exam.secondsLeft--;
        const m = Math.floor(this.exam.secondsLeft / 60);
        const s = this.exam.secondsLeft % 60;
        timerEl.textContent = `⏱️ ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        if (this.exam.secondsLeft < 300) {
          timerEl.classList.add('warning');
        } else {
          timerEl.classList.remove('warning');
        }
      }, 1000);
    },

    renderExamView: function() {
      const q = this.exam.questions[this.exam.currentIndex];
      if (!q) return;

      const badgeEl = document.getElementById('q-badge');
      const textEl = document.getElementById('q-text');
      const optsEl = document.getElementById('q-options');
      const flagBtn = document.getElementById('btn-flag-q');

      if (badgeEl) badgeEl.textContent = `Soru ${this.exam.currentIndex + 1} / 20 (${q.unitTitle} - ${q.topic})`;
      if (textEl) textEl.textContent = q.question;

      if (flagBtn) {
        const isFlagged = !!this.exam.flagged[this.exam.currentIndex];
        flagBtn.innerHTML = isFlagged ? '⭐ İşareti Kaldır' : '🚩 Gözden Geçir';
        flagBtn.className = isFlagged ? 'btn btn-secondary' : 'btn btn-secondary';
      }

      if (optsEl) {
        optsEl.innerHTML = '';
        ['A', 'B', 'C', 'D', 'E'].forEach(letter => {
          if (!q.options[letter]) return;
          const optDiv = document.createElement('div');
          const isSelected = this.exam.userAnswers[this.exam.currentIndex] === letter;
          optDiv.className = `option-item ${isSelected ? 'selected' : ''}`;
          optDiv.innerHTML = `
            <div class="option-key">${letter}</div>
            <div class="option-text">${q.options[letter]}</div>
          `;
          optDiv.onclick = () => {
            this.exam.userAnswers[this.exam.currentIndex] = letter;
            this.renderExamView();
            this.renderExamPalette();
          };
          optsEl.appendChild(optDiv);
        });
      }

      // Prev / Next button state
      const prevBtn = document.getElementById('btn-prev-q');
      const nextBtn = document.getElementById('btn-next-q');
      if (prevBtn) prevBtn.disabled = (this.exam.currentIndex === 0);
      if (nextBtn) {
        if (this.exam.currentIndex === 19) {
          nextBtn.textContent = 'Sınavı Bitir 🏁';
          nextBtn.onclick = () => this.finishExam();
        } else {
          nextBtn.textContent = 'Sonraki Soru ➡️';
          nextBtn.onclick = () => this.nextExamQuestion();
        }
      }

      this.renderExamPalette();
    },

    renderExamPalette: function() {
      const palette = document.getElementById('exam-palette');
      if (!palette) return;
      palette.innerHTML = '';

      for (let i = 0; i < 20; i++) {
        const btn = document.createElement('button');
        const isCurrent = (i === this.exam.currentIndex);
        const isAnswered = this.exam.userAnswers.hasOwnProperty(i);
        const isFlagged = !!this.exam.flagged[i];

        let classes = 'palette-btn';
        if (isCurrent) classes += ' current';
        if (isAnswered) classes += ' answered';
        if (isFlagged) classes += ' flagged';

        btn.className = classes;
        btn.textContent = (i + 1);
        btn.onclick = () => {
          this.exam.currentIndex = i;
          this.renderExamView();
        };
        palette.appendChild(btn);
      }
    },

    prevExamQuestion: function() {
      if (this.exam.currentIndex > 0) {
        this.exam.currentIndex--;
        this.renderExamView();
      }
    },

    nextExamQuestion: function() {
      if (this.exam.currentIndex < 19) {
        this.exam.currentIndex++;
        this.renderExamView();
      }
    },

    toggleFlagQuestion: function() {
      const idx = this.exam.currentIndex;
      if (this.exam.flagged[idx]) {
        delete this.exam.flagged[idx];
      } else {
        this.exam.flagged[idx] = true;
      }
      this.renderExamView();
    },

    finishExam: function(autoTimeout = false) {
      if (this.exam.timerInterval) clearInterval(this.exam.timerInterval);
      this.exam.isFinished = true;

      let correctCount = 0;
      let wrongCount = 0;
      let emptyCount = 0;
      const unitBreakdown = { 1: { c: 0, w: 0, e: 0 }, 2: { c: 0, w: 0, e: 0 }, 3: { c: 0, w: 0, e: 0 }, 4: { c: 0, w: 0, e: 0 } };

      this.exam.questions.forEach((q, idx) => {
        const ans = this.exam.userAnswers[idx];
        const u = q.unitId;
        if (!ans) {
          emptyCount++;
          unitBreakdown[u].e++;
        } else if (ans === q.correct) {
          correctCount++;
          unitBreakdown[u].c++;
        } else {
          wrongCount++;
          unitBreakdown[u].w++;
        }
      });

      // 4 yanlış 1 doğru kuralı opsiyonel
      let net = correctCount;
      if (this.exam.applyPenalty) {
        net = Math.max(0, correctCount - (wrongCount / 4));
      }
      const score = Math.round((net / 20) * 100);

      // Save to localStorage
      saveCourseExamResult(this.course.id, score);

      // Render Result screen
      this.renderExamResults(score, net, correctCount, wrongCount, emptyCount, unitBreakdown, autoTimeout);

      if (score >= 90) {
        launchConfetti();
      }
    },

    renderExamResults: function(score, net, correctCount, wrongCount, emptyCount, unitBreakdown, autoTimeout) {
      const viewContainer = document.getElementById('exam-active-view');
      const resultContainer = document.getElementById('exam-result-view');
      if (viewContainer) viewContainer.style.display = 'none';
      if (!resultContainer) return;

      resultContainer.style.display = 'block';

      let grade = 'FF';
      let badgeClass = 'fail';
      let msg = 'Vize konularını henüz tam oturtamadın, aşağıdaki detaylı çözümleri ve altın notları mutlaka çalış!';

      if (score >= 90) {
        grade = 'AA';
        badgeClass = 'aa';
        msg = '🎉 MÜKEMMEL! Vizeye tam anlamıyla hazırsın. 100 almak garanti!';
      } else if (score >= 80) {
        grade = 'BA';
        badgeClass = 'ba';
        msg = 'Çok başarılı bir performans! Birkaç küçük hatayı da gidererek 100 alabilirsin.';
      } else if (score >= 70) {
        grade = 'BB';
        badgeClass = 'bb';
        msg = 'Oldukça iyi! Altın özetleri hızlıca gözden geçirerek eksiklerini tamamla.';
      } else if (score >= 60) {
        grade = 'CB';
        badgeClass = 'cb';
        msg = 'Geçer not aldın ama hedefimiz 100! Yanlış yaptığın üniteleri tekrar çöz.';
      }

      resultContainer.innerHTML = `
        <div class="result-card">
          <div class="result-badge ${badgeClass}">${grade}</div>
          <h2 class="score-title">Vize Sınav Sonucun: ${score} / 100</h2>
          <p class="score-subtitle">${msg}</p>

          <div class="score-stats">
            <div class="score-stat-box">
              <div class="val text-success" style="color:var(--success)">${correctCount}</div>
              <div class="lbl">Doğru Soru</div>
            </div>
            <div class="score-stat-box">
              <div class="val text-danger" style="color:var(--danger)">${wrongCount}</div>
              <div class="lbl">Yanlış Soru</div>
            </div>
            <div class="score-stat-box">
              <div class="val" style="color:var(--text-muted)">${emptyCount}</div>
              <div class="lbl">Boş Bırakılan</div>
            </div>
            <div class="score-stat-box">
              <div class="val" style="color:var(--primary)">${net.toFixed(2)}</div>
              <div class="lbl">Net Sayısı</div>
            </div>
          </div>

          <div style="max-width:650px; margin: 1.5rem auto 2rem; text-align:left; background:var(--bg-elevated); padding:1.25rem; border-radius:var(--radius-md);">
            <h4 style="margin-bottom:0.75rem; font-size:1rem;">📊 Ünite Bazlı Başarı Analizi</h4>
            ${[1, 2, 3, 4].map(u => `
              <div style="margin-bottom:0.6rem;">
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:0.25rem;">
                  <span>Ünite ${u} Başarısı:</span>
                  <b>${unitBreakdown[u].c} Doğru / ${unitBreakdown[u].w} Yanlış</b>
                </div>
                <div style="height:8px; background:var(--border-color); border-radius:4px; overflow:hidden;">
                  <div style="height:100%; width:${(unitBreakdown[u].c / 5) * 100}%; background:var(--primary);"></div>
                </div>
              </div>
            `).join('')}
          </div>

          <div style="display:flex; justify-content:center; gap:1rem; flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="IsletmeApp.restartExam()">🔄 Yeni 20 Soru ile Tekrar Dene</button>
            <button class="btn btn-secondary" onclick="window.print()">🖨️ Sınav Raporunu Yazdır / PDF</button>
          </div>
        </div>

        <h3 style="margin:2.5rem 0 1.25rem; font-size:1.4rem;">📝 Soru Çözümleri ve Detaylı Açıklamalar</h3>
        <div class="review-questions-list">
          ${this.exam.questions.map((q, idx) => {
            const userAns = this.exam.userAnswers[idx];
            const isCorrect = userAns === q.correct;
            const statusClass = isCorrect ? 'correct' : (userAns ? 'wrong' : 'empty');
            return `
              <div class="practice-card" style="border-left: 5px solid ${isCorrect ? 'var(--success)' : (userAns ? 'var(--danger)' : 'var(--text-muted)')};">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                  <span class="question-badge">Soru ${idx + 1} (${q.unitTitle})</span>
                  <span style="font-size:0.85rem; font-weight:700; color:${isCorrect ? 'var(--success)' : (userAns ? 'var(--danger)' : 'var(--text-muted)')}">
                    ${isCorrect ? '✅ Doğru Yapıldı (+5 Puan)' : (userAns ? `❌ Yanlış Yapıldı (Senin Cevabın: ${userAns})` : '⚪ Boş Bırakıldı')}
                  </span>
                </div>
                <p class="question-text" style="font-size:1.05rem;">${q.question}</p>
                <div class="options-list" style="margin-bottom:1rem;">
                  ${['A', 'B', 'C', 'D', 'E'].map(letter => {
                    if (!q.options[letter]) return '';
                    let optCls = 'option-item';
                    if (letter === q.correct) optCls += ' correct';
                    else if (letter === userAns) optCls += ' wrong';
                    return `
                      <div class="${optCls}" style="cursor:default; padding:0.6rem 1rem;">
                        <div class="option-key">${letter}</div>
                        <div class="option-text">${q.options[letter]}</div>
                      </div>
                    `;
                  }).join('')}
                </div>
                <div class="explanation-box show" style="display:block;">
                  <h5>💡 Çözüm Açıklaması & Kitaptaki Yeri:</h5>
                  <p style="font-size:0.9rem; color:var(--text-main);">${q.explanation}</p>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    },

    restartExam: function() {
      const viewContainer = document.getElementById('exam-active-view');
      const resultContainer = document.getElementById('exam-result-view');
      if (viewContainer) viewContainer.style.display = 'block';
      if (resultContainer) resultContainer.style.display = 'none';
      this.setupExamQuestions();
      this.renderExamView();
      this.startExamTimer();
    },

    // --- Study Notes & Summaries ---
    initStudyNotes: function() {
      const container = document.getElementById('unit-accordions-container');
      if (!container) return;

      container.innerHTML = this.course.units.map((unit, idx) => `
        <div class="unit-card">
          <div class="unit-header" onclick="IsletmeApp.toggleUnitAccordion(${unit.id})">
            <div class="unit-title-group">
              <h3>${unit.title}</h3>
              <span class="question-badge" style="background:var(--bg-elevated); color:var(--text-muted); font-size:0.75rem;">${unit.badge}</span>
            </div>
            <span id="acc-icon-${unit.id}" style="font-size:1.25rem;">${idx === 0 ? '▲' : '▼'}</span>
          </div>
          <div id="unit-body-${unit.id}" class="unit-body ${idx === 0 ? 'open' : ''}">
            <div class="key-concepts-box">
              <b style="font-size:0.9rem; color:var(--primary);">🔑 Ünitenin Anahtar Kavramları:</b>
              <div class="concept-pills">
                ${unit.keyConcepts.map(c => `<span class="concept-pill">${c}</span>`).join('')}
              </div>
            </div>

            <div class="summary-list">
              ${unit.summaryPoints.map(pt => `
                <div class="summary-item">
                  ${pt.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')}
                </div>
              `).join('')}
            </div>

            <div class="exam-trap-box">
              <h4>🚨 Sınav Tuzakları & 100 Aldıran Taktikler:</h4>
              <ul style="padding-left:1.25rem; font-size:0.9rem; line-height:1.6;">
                ${unit.examTraps.map(trap => `<li>${trap.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>
      `).join('');
    },

    toggleUnitAccordion: function(unitId) {
      const body = document.getElementById(`unit-body-${unitId}`);
      const icon = document.getElementById(`acc-icon-${unitId}`);
      if (!body) return;
      const isOpen = body.classList.contains('open');
      if (isOpen) {
        body.classList.remove('open');
        if (icon) icon.textContent = '▼';
      } else {
        body.classList.add('open');
        if (icon) icon.textContent = '▲';
      }
    },

    // --- Practice Mode (Pekiştirme) ---
    initPracticeMode: function() {
      this.renderPracticeQuestions('all');
    },

    renderPracticeQuestions: function(filterUnit) {
      const container = document.getElementById('practice-list-container');
      if (!container) return;

      let list = this.course.allQuestions;
      if (filterUnit !== 'all') {
        const uNum = parseInt(filterUnit, 10);
        list = list.filter(q => q.unitId === uNum);
      }

      container.innerHTML = list.map((q, idx) => `
        <div class="practice-card" id="practice-q-${q.id}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
            <span class="question-badge">${q.unitTitle} - Soru ${idx + 1} (${q.topic})</span>
          </div>
          <p class="question-text">${q.question}</p>
          <div class="options-list">
            ${['A', 'B', 'C', 'D', 'E'].map(letter => {
              if (!q.options[letter]) return '';
              return `
                <div class="option-item" id="opt-${q.id}-${letter}" onclick="IsletmeApp.selectPracticeOption('${q.id}', '${letter}', '${q.correct}')">
                  <div class="option-key">${letter}</div>
                  <div class="option-text">${q.options[letter]}</div>
                </div>
              `;
            }).join('')}
          </div>
          <div class="explanation-box" id="exp-${q.id}">
            <h5>💡 Çözüm ve Konu Referansı:</h5>
            <p style="font-size:0.9rem; color:var(--text-main);">${q.explanation}</p>
          </div>
        </div>
      `).join('');
    },

    selectPracticeOption: function(qId, selectedLetter, correctLetter) {
      const card = document.getElementById(`practice-q-${qId}`);
      if (!card) return;

      const opts = card.querySelectorAll('.option-item');
      opts.forEach(opt => {
        opt.classList.remove('selected', 'correct', 'wrong');
        opt.style.pointerEvents = 'none'; // Lock after choice
      });

      const selectedOpt = document.getElementById(`opt-${qId}-${selectedLetter}`);
      const correctOpt = document.getElementById(`opt-${qId}-${correctLetter}`);

      if (selectedLetter === correctLetter) {
        if (selectedOpt) selectedOpt.classList.add('correct');
      } else {
        if (selectedOpt) selectedOpt.classList.add('wrong');
        if (correctOpt) correctOpt.classList.add('correct');
      }

      const exp = document.getElementById(`exp-${qId}`);
      if (exp) exp.classList.add('show');
    },

    filterPracticeUnit: function(u) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      const activeBtn = document.getElementById(`filter-u-${u}`);
      if (activeBtn) activeBtn.classList.add('active');
      this.renderPracticeQuestions(u);
    },

    // --- Flashcards ---
    initFlashcards: function() {
      this.flashcards.list = this.course.flashcards;
      this.flashcards.currentIndex = 0;
      this.flashcards.isFlipped = false;
      this.renderFlashcard();
    },

    renderFlashcard: function() {
      const card = this.flashcards.list[this.flashcards.currentIndex];
      if (!card) return;

      const cardEl = document.getElementById('active-flashcard');
      const frontTag = document.getElementById('card-front-tag');
      const frontTerm = document.getElementById('card-front-term');
      const backTag = document.getElementById('card-back-tag');
      const backDef = document.getElementById('card-back-def');
      const progressEl = document.getElementById('card-progress-num');

      if (cardEl) cardEl.classList.remove('flipped');
      this.flashcards.isFlipped = false;

      if (frontTag) frontTag.textContent = card.category;
      if (frontTerm) frontTerm.textContent = card.term;
      if (backTag) backTag.textContent = card.category;
      if (backDef) backDef.textContent = card.def;
      if (progressEl) progressEl.textContent = `${this.flashcards.currentIndex + 1} / ${this.flashcards.list.length}`;
    },

    flipFlashcard: function() {
      const cardEl = document.getElementById('active-flashcard');
      if (!cardEl) return;
      this.flashcards.isFlipped = !this.flashcards.isFlipped;
      if (this.flashcards.isFlipped) {
        cardEl.classList.add('flipped');
      } else {
        cardEl.classList.remove('flipped');
      }
    },

    prevFlashcard: function() {
      if (this.flashcards.currentIndex > 0) {
        this.flashcards.currentIndex--;
        this.renderFlashcard();
      }
    },

    nextFlashcard: function() {
      if (this.flashcards.currentIndex < this.flashcards.list.length - 1) {
        this.flashcards.currentIndex++;
        this.renderFlashcard();
      }
    }
  };

  // Auto initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    const courseId = document.body.getAttribute('data-course');
    window.IsletmeApp.init(courseId);
  });
})();

