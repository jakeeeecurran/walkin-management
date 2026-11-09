// Help: short how-tos, filtered to what the signed-in person can actually do.
//   sp = salesperson, sm = sales manager, gm = general manager / admin
(function () {
  const CRM = window.CRM;
  const { h } = CRM;

  const ALL = ['sp', 'sm', 'gm'];
  const MGR = ['sm', 'gm'];
  const GM = ['gm'];

  // Each topic: title, who sees it, and short steps (or a sentence) in plain language.
  const GROUPS = [
    {
      title: 'Getting started',
      topics: [
        { t: 'Signing in for the first time', who: ALL, steps: ['Use the username and temporary password your manager gave you.', 'Choose your own password (at least 10 characters). Nobody else can see it.', 'Forgotten it? Ask your sales manager to reset it.'] },
        { t: 'Put it on your phone like an app', who: ALL, steps: ['iPhone: open it in Safari, tap Share, then Add to Home Screen.', 'Android: open it in Chrome, tap the ⋮ menu, then Add to Home screen.'] },
        { t: 'Light or dark screen', who: ALL, steps: ['Tap the moon or sun button at the top, or choose in Account, Appearance.'] },
        { t: 'Reminder emails', who: ALL, steps: ['Each morning you get an email listing the customers to follow up that day.', 'Turn it off or change your email address in Account.'] },
      ],
    },
    {
      title: 'Logging a walk-in',
      topics: [
        { t: 'Log a walk-in in 30 seconds', who: ALL, steps: ['Tap New walk-in (or + on a phone).', '1 Vehicle: tap the brand and choose the model.', '2 Customer: name, postcode and a phone or email.', '3 Visit: tap Test drive, Trade-in or Finance if they apply, pick the next follow-up date, add a comment, then Save.'] },
        { t: 'Used cars', who: ALL, steps: ['Choose Used Cars as the brand, then type the make and model as you would say them ("toyota hilux").', 'Spelling slips are matched for you ("hodna" becomes Honda).', 'Add the stock number if you have it; you can search by it later.'] },
        { t: '"Already enquiring" warning', who: ALL, steps: ['The customer already has an open enquiry with someone, at any site.', 'Talk to that salesperson or your manager rather than adding a second one.'] },
        { t: 'A model is missing from the list', who: ['sp', 'sm'], steps: ['Ask the general manager to add it in Admin, Models. It appears straight away.'] },
      ],
    },
    {
      title: 'Follow-ups and closing',
      topics: [
        { t: 'Your Today screen', who: ['sp'], steps: ['To follow up today lists everyone to contact today, oldest first.', 'Walk-ins today shows everyone you have logged today.'] },
        { t: 'Log a follow-up', who: ALL, steps: ['Open the customer and tap Log follow-up.', 'Say what happened (Called, No answer, SMS, Email or Other), pick the next date, add a note and Save.', 'Log it even when there is no answer; it keeps the date current and shows the work you did.'] },
        { t: 'Sold or lost (salespeople)', who: ['sp'], steps: ['Tap Sold or Lost on the customer’s page and add a short note (for Lost, pick the reason).', 'It goes to your sales manager to approve. Until then it shows "Sold · approval".', 'Changed your mind? Tap Withdraw request.', 'If it is declined, the reason shows on the enquiry and it comes back to your Today screen.'] },
        { t: 'Sold or lost (managers)', who: MGR, steps: ['When you mark an enquiry sold or lost yourself it closes straight away.', 'If it was closed by mistake, open the ⋯ menu and choose Re-open.'] },
        { t: 'Find an enquiry', who: ALL, steps: ['Search by name, phone, email or stock number.', 'Use Show to switch between Open, Due today, Awaiting approval, Sold, Lost and more.', 'Filters narrows by brand' + ' (and salesperson for managers).'] },
      ],
    },
    {
      title: 'Approvals and your team',
      topics: [
        { t: 'Approve or decline a sale or loss', who: MGR, steps: ['Requests show on Today under "Waiting for your approval", in Enquiries under Awaiting approval, and in your morning email.', 'Open it, read the salesperson’s note, then Approve or Decline.', 'Always give a reason. A sale counts from the day it was sent.', 'Declined requests stay open and go back to the salesperson’s Today screen with your reason.'] },
        { t: 'Morning meeting', who: MGR, steps: ['Open Morning meeting (in the menu, or the link on Today) before the sales meeting.', 'Yesterday and Month so far give the results to start with.', 'The Hit list ranks the hottest open customers (test drives, finance, trade-ins, new this week, due today) with the last note on each.', 'Round the room shows each salesperson’s day; Today’s follow-ups lists who each person should contact.', 'Tap Print for a paper copy.'] },
        { t: 'Today at a glance', who: MGR, steps: ['The summary at the top of Today shows walk-ins, test drives, sales, follow-ups done and approvals for today (sales managers also see follow-ups running late).', 'The table underneath splits it by salesperson (or by site for the general manager), so a quiet day stands out.'] },
        { t: 'A 10-minute daily routine', who: MGR, steps: ['Clear every approval, with a reason.', 'Check Running late and filter by salesperson; ask about anything 3+ days late.', 'Compare Walk-ins today with who came through the door.', 'Open two or three enquiries and read the history.'] },
        { t: 'Check one salesperson’s work', who: MGR, steps: ['Enquiries, choose a view (e.g. Running late), tap Filters, pick the salesperson, then Show results.', 'Reports, Breakdown, By salesperson compares everyone’s enquiries, test drives and conversion.'] },
        { t: 'Fix or hand over an enquiry', who: MGR, steps: ['On the enquiry, open the ⋯ menu.', 'Edit details to correct it, Reassign to give it to someone else, or Mark duplicate/invalid to drop it from the numbers. Nothing is ever deleted.'] },
        { t: 'Add a salesperson', who: MGR, steps: ['Team, + Add person. Enter their name, a username and email.', 'Open each site and tap the brands they sell, then Add person.', 'Give them the temporary password in person. It is shown only once.'] },
        { t: 'Reset a password', who: MGR, steps: ['Team, tap the person, More, Reset password. Give them the new temporary password.'] },
        { t: 'Someone leaves or goes on leave', who: MGR, steps: ['Team, tap the person, More, Move open enquiries, and choose who takes them.', 'Then More, Disable. They are signed out at once; their enquiries and history are kept.', 'Disabled people are hidden from Team; tap Show disabled to see them.'] },
        { t: 'Export to Excel', who: MGR, steps: ['Reports, the ⋯ button at the top right, Export to Excel. It uses the period and filters you have chosen.'] },
      ],
    },
    {
      title: 'Reports',
      topics: [
        { t: 'Reading your numbers', who: ALL, steps: ['Choose Day, Month, Year to date or a date range at the top.', 'Conversion = enquiries sold ÷ enquiries entered in the period (20 sold from 60 is 33%).', 'Each figure shows the change from the previous period. More figures adds trade-in, finance and follow-ups on time.'] },
        { t: 'Who sees what', who: ['sp'], steps: ['Salespeople see only their own enquiries and figures.'] },
        { t: 'Who sees what', who: ['sm'], steps: ['You see every enquiry in the brands and sites you look after. Salespeople see only their own.'] },
      ],
    },
    {
      title: 'General manager',
      topics: [
        { t: 'Sales board', who: GM, steps: ['Sales board (in the menu) lists every car sold today: time, salesperson, brand and model, site, customer, stock number and who approved it.', 'Leaderboards rank salespeople by cars sold today and this month. It refreshes itself every minute.', 'A sale appears once a manager approves it.'] },
        { t: 'Brand trends', who: GM, steps: ['Reports, Brand trends. The current month shows by day; tap Months to pick more (up to a year) and it shows by month.', 'Tap brands to compare them, or All brands. Up to five share one chart; more get a chart each on the same scale.', 'The bubbles show each brand’s share of enquiries.'] },
        { t: 'Sites, brands and models', who: GM, steps: ['Admin, Sites & brands: tick which brands each site sells, or add a brand.', 'Admin, Models: add a model the day it launches; retire old ones (past enquiries keep them).'] },
        { t: 'Sales managers', who: GM, steps: ['Team, + Add person, Role: Sales Manager. Open each site and tap their brands. Every site needs at least one.'] },
        { t: 'Email reminders', who: GM, steps: ['Admin, Email & settings: enter the email account details from your IT provider, Send test, then turn reminders on.', 'Set the CRM web address so links in emails work.'] },
        { t: 'Backups', who: GM, steps: ['A backup runs every night and can be emailed off-site, encrypted with your backup passphrase.', 'Admin, Backups shows when the last one ran. Back up now before any big change.', 'Keep the backup passphrase written down somewhere safe, away from the server.'] },
        { t: 'If something breaks', who: GM, steps: ['If the app opens: Admin, Backups, Restore from a backup file, choose the latest backup email attachment and enter the passphrase.', 'If the server is lost: set the CRM up on a new server and run the restore command (see the hosting guide), then everyone signs in as usual.'] },
        { t: 'A customer asks to be removed', who: GM, steps: ['On the enquiry, ⋯, Remove personal details. Their name, phone, email and comments are blanked; the sale or enquiry still counts in reports.'] },
        { t: 'Audit log', who: GM, steps: ['Admin, Audit log lists sign-ins, exports, restores and other important changes, with who did them.'] },
      ],
    },
  ];

  const ASK = {
    sp: 'Your sales manager: passwords, brands you can log, models, and anything that looks wrong.',
    sm: 'The general manager: new brands or models, another site, email or backup problems.',
    gm: 'Your IT provider: the server, email account details or network. The hosting guides are in the project’s docs folder.',
  };

  CRM.route(/^\/help$/, async (main) => {
    const me = CRM.state.me;
    const ref = await CRM.loadRef();
    const who = CRM.isFull() ? 'gm' : CRM.isManager() ? 'sm' : 'sp';
    const roleName = CRM.ROLE[me.role] + (me.is_admin && me.role !== 'general_manager' ? ' (admin)' : '');

    // What this person can work on.
    const sites = new Map();
    for (const f of ref.franchises.filter((x) => x.can_create)) {
      const site = CRM.byId(ref.locations, f.location_id)?.name;
      const brand = CRM.byId(ref.brands, f.brand_id)?.name;
      if (site && brand) sites.set(site, [...(sites.get(site) || []), brand]);
    }
    const access =
      who === 'gm'
        ? 'Everything: every site, every brand and every enquiry, plus Admin and the Sales board.'
        : who === 'sm'
          ? 'Every enquiry in your brands and sites, approvals for them, your team and their reports.'
          : 'Your own enquiries and figures in the brands below.';

    const q = h('input', { type: 'search', placeholder: 'Search help, e.g. password, used car, approve', 'aria-label': 'Search help', oninput: () => draw() });
    const list = h('div', { class: 'help-groups' });

    function draw() {
      const term = q.value.trim().toLowerCase();
      const groups = GROUPS.map((g) => ({ ...g, topics: g.topics.filter((t) => t.who.includes(who) && (!term || (t.t + ' ' + t.steps.join(' ')).toLowerCase().includes(term))) })).filter((g) => g.topics.length);
      list.replaceChildren(
        ...(groups.length
          ? groups.map((g) =>
              h(
                'section',
                { class: 'card help-group' },
                h('h2', null, g.title),
                g.topics.map((t) =>
                  h(
                    'details',
                    { class: 'help-topic', open: !!term },
                    h('summary', null, t.t),
                    t.steps.length > 1 ? h('ol', null, t.steps.map((x) => h('li', null, x))) : h('p', null, t.steps[0])
                  )
                )
              )
            )
          : [CRM.empty('Nothing found', 'Try another word, or ask the person below.', 'search')])
      );
    }

    main.replaceChildren(
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Help'), h('p', { class: 'muted small' }, `Showing what you can do as a ${roleName}.`))),
      h(
        'section',
        { class: 'card help-access' },
        h('div', { class: 'help-access-head' }, CRM.avatar(me.name), h('div', null, h('b', null, me.name), h('div', { class: 'muted small' }, roleName))),
        h('p', null, access),
        who !== 'gm' && sites.size ? h('ul', { class: 'help-sites' }, [...sites].map(([site, brands]) => h('li', null, h('b', null, site), ' ', brands.join(', ')))) : null
      ),
      h('div', { class: 'search help-search' }, CRM.icon('search'), q),
      list,
      h('section', { class: 'card help-ask' }, h('h2', null, 'Still stuck?'), h('p', null, ASK[who]))
    );
    draw();
  });
})();
