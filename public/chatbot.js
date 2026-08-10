(function () {
  var CONFIG = {
    botName: 'Care Assistant',
    greeting: 'Hello! I am the clinic assistant for Prof. Dr. Javed Iqbal. Ask me about clinic hours, services, charges, or how to book an appointment.',
    bookUrl: 'book.html',
    quickReplies: [
      'Clinic hours',
      'How do I book?',
      'Services & charges',
      'Career counseling',
      'Location & contact'
    ]
  };

  var FAQS = [
    {
      keys: ['hour', 'time', 'timing', 'open', 'close', 'when', 'what time'],
      answer: 'The clinic is open Monday to Friday, 9:00 AM to 5:00 PM, and Saturday 9:00 AM to 1:00 PM. We are closed on Sundays.'
    },
    {
      keys: ['book', 'appointment', 'appoint', 'slot', 'reserve', 'schedule', 'booking'],
      answer: 'Booking takes less than a minute:\n1. Tap "Book Appointment" and pick a date.\n2. Choose an available time.\n3. Enter your name, phone and email.\nYou will get a reference number instantly, and the clinic confirms your visit by phone.'
    },
    {
      keys: ['fee', 'charge', 'price', 'cost', 'payment', 'pay', 'rupee', 'rs ', 'rate'],
      answer: 'ENT consultation appointments made here are free of charge. Career counseling is charged at Rs 1,200 per hour.'
    },
    {
      keys: ['career', 'counsel', 'guidance', 'mentor', 'study', 'job'],
      answer: 'Yes! Prof. Dr. Javed Iqbal also offers career counseling for students and professionals at Rs 1,200 per hour. Choose "Career Counseling" as the visit type when booking.'
    },
    {
      keys: ['location', 'address', 'where', 'clinic', 'hospital', 'reach'],
      answer: 'The clinic is in Lahore, Pakistan. For the exact address, please call the clinic during opening hours — the phone number is listed on the homepage under Contact.'
    },
    {
      keys: ['phone', 'contact', 'call', 'number', 'whatsapp'],
      answer: 'You can call the clinic during opening hours. The phone number is on the homepage under Contact, or book online and the clinic will call you back to confirm.'
    },
    {
      keys: ['doctor', 'experience', 'qualification', 'professor', 'who', 'about'],
      answer: 'Prof. Dr. Javed Iqbal is a Professor of Otolaryngology (ENT) in Lahore with 30+ years of experience. He has taught at different universities and treats ear, nose, throat, and head & neck conditions.'
    },
    {
      keys: ['service', 'treat', 'problem', 'help with', 'what do'],
      answer: 'He treats: ear care (hearing loss, infections, tinnitus), nose & sinus (allergies, sinusitis, nosebleeds), throat care (sore throat, voice, tonsillitis), balance & dizziness, and head & neck conditions.'
    },
    {
      keys: ['emergency', 'urgent', 'pain', 'accident'],
      answer: 'If this is an emergency, please go to the nearest hospital or emergency room right away. Do not wait for an online appointment.'
    },
    {
      keys: ['hi', 'hello', 'hey', 'salam', 'assalam'],
      answer: 'Hello! Welcome to Prof. Dr. Javed Iqbal\'s clinic. How can I help you today?'
    },
    {
      keys: ['thank', 'thanks', 'shukriya', 'ok'],
      answer: 'You are most welcome! Take care.'
    },
    {
      keys: ['cancel', 'change', 'reschedule', 'move'],
      answer: 'To cancel or reschedule, please call the clinic directly during opening hours, or contact us and we will update your appointment.'
    },
    {
      keys: ['ref', 'reference', 'confirm', 'status'],
      answer: 'You will receive an appointment reference number after booking. Keep it handy — the clinic calls you to confirm your visit.'
    }
  ];

  var FALLBACK = 'I am not sure about that, but I can help with clinic hours, services, charges, and booking. For anything else, please call the clinic during opening hours.';

  function findAnswer(text) {
    var t = (text || '').toLowerCase();
    var best = null;
    for (var i = 0; i < FAQS.length; i++) {
      var score = 0;
      for (var j = 0; j < FAQS[i].keys.length; j++) {
        if (t.indexOf(FAQS[i].keys[j]) !== -1) score++;
      }
      if (score > 0 && (best === null || score > best.score)) {
        best = { score: score, answer: FAQS[i].answer };
      }
    }
    return best ? best.answer : FALLBACK;
  }

  function makeWidget() {
    var el = document.createElement('div');
    el.innerHTML =
      '<button type="button" class="chat-toggle" id="chatToggle" aria-label="Open chat">' +
        '<span class="chat-ico">&#128172;</span>' +
      '</button>' +
      '<div class="chat-window hidden" id="chatWindow">' +
        '<div class="chat-head">' +
          '<div class="chat-avatar">JI</div>' +
          '<div>' +
            '<div class="chat-head-title">' + CONFIG.botName + '</div>' +
            '<div class="chat-head-sub">Prof. Dr. Javed Iqbal clinic</div>' +
          '</div>' +
          '<button type="button" class="chat-close" id="chatClose" aria-label="Close chat">&times;</button>' +
        '</div>' +
        '<div class="chat-body" id="chatBody"></div>' +
        '<div class="chat-chips" id="chatChips"></div>' +
        '<div class="chat-input-row">' +
          '<input type="text" id="chatInput" placeholder="Type your question..." autocomplete="off">' +
          '<button type="button" class="chat-send" id="chatSend" aria-label="Send">&#10148;</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    return {
      toggle: document.getElementById('chatToggle'),
      window: document.getElementById('chatWindow'),
      close: document.getElementById('chatClose'),
      body: document.getElementById('chatBody'),
      chips: document.getElementById('chatChips'),
      input: document.getElementById('chatInput'),
      send: document.getElementById('chatSend')
    };
  }

  function init() {
    var ui = makeWidget();
    var opened = false;

    function scrollBottom() {
      ui.body.scrollTop = ui.body.scrollHeight;
    }

    function addMsg(text, who) {
      var div = document.createElement('div');
      div.className = 'chat-msg ' + who;
      div.textContent = text;
      ui.body.appendChild(div);
      scrollBottom();
    }

    function showTyping() {
      var div = document.createElement('div');
      div.className = 'chat-msg bot chat-typing';
      div.innerHTML = '<span></span><span></span><span></span>';
      ui.body.appendChild(div);
      scrollBottom();
      return div;
    }

    function reply(text) {
      var typing = showTyping();
      setTimeout(function () {
        typing.remove();
        addMsg(text, 'bot');
      }, 500 + Math.random() * 400);
    }

    function sendMessage(raw) {
      var text = (raw || '').trim();
      if (!text) return;
      addMsg(text, 'user');
      ui.input.value = '';
      reply(findAnswer(text));
    }

    function renderChips() {
      ui.chips.innerHTML = '';
      CONFIG.quickReplies.forEach(function (q) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chat-chip';
        btn.textContent = q;
        btn.addEventListener('click', function () { sendMessage(q); });
        ui.chips.appendChild(btn);
      });
      var bookBtn = document.createElement('a');
      bookBtn.className = 'chat-chip';
      bookBtn.href = CONFIG.bookUrl;
      bookBtn.textContent = 'Book Appointment \u2192';
      ui.chips.appendChild(bookBtn);
    }

    function open() {
      ui.window.classList.remove('hidden');
      ui.toggle.classList.add('hidden');
      if (!opened) {
        opened = true;
        renderChips();
        setTimeout(function () { addMsg(CONFIG.greeting, 'bot'); }, 200);
      }
      ui.input.focus();
    }

    function closeChat() {
      ui.window.classList.add('hidden');
      ui.toggle.classList.remove('hidden');
    }

    ui.toggle.addEventListener('click', open);
    ui.close.addEventListener('click', closeChat);
    ui.send.addEventListener('click', function () { sendMessage(ui.input.value); });
    ui.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') sendMessage(ui.input.value);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
