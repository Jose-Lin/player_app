document.addEventListener('DOMContentLoaded', function() {
    const cardViewBtn = document.getElementById('card-view-btn');
    const listViewBtn = document.getElementById('list-view-btn');
    const cardView = document.getElementById('card-view');
    const listView = document.getElementById('list-view');

    // 切换视图函数
    function switchView(activeView) {
        if (activeView === 'card') {
            cardView.style.display = 'grid';
            listView.style.display = 'none';
            cardViewBtn.classList.add('active');
            listViewBtn.classList.remove('active');
        } else {
            cardView.style.display = 'none';
            listView.style.display = 'block';
            cardViewBtn.classList.remove('active');
            listViewBtn.classList.add('active');
        }
    }

    // 按钮事件监听
    cardViewBtn.addEventListener('click', () => switchView('card'));
    listViewBtn.addEventListener('click', () => switchView('list'));
});