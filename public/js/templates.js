window.templatesLoaded = (async function loadTemplates() {
    const headerPlaceholder = document.getElementById('header-placeholder');
    const footerPlaceholder = document.getElementById('footer-placeholder');

    const tasks = [];
    if (headerPlaceholder) {
        tasks.push(fetch('/includes/header.html').then(r => r.text()).then(html => {
            headerPlaceholder.innerHTML = html;
        }));
    }
    if (footerPlaceholder) {
        tasks.push(fetch('/includes/footer.html').then(r => r.text()).then(html => {
            footerPlaceholder.innerHTML = html;
        }));
    }
    return Promise.all(tasks);
})();
