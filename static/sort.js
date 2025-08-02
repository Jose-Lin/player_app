let currentSort = {
    column: null,
    direction: 'asc' // 'asc' 或 'desc'
};

function sortTable(column) {
    // 如果点击的是已排序列，切换排序方向
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }

    // 更新排序图标
    updateSortIcons();
    
    // 获取当前显示的数据
    const filtered = getFilteredPlayers();
    
    // 排序数据
    const sortedPlayers = [...filtered].sort((a, b) => {
        let valueA = a[column];
        let valueB = b[column];
        
        // 处理空值
        if (!valueA) return 1;
        if (!valueB) return -1;
        
        // 特殊处理年龄（转为数字比较）
        if (column === 'age') {
            valueA = parseInt(valueA);
            valueB = parseInt(valueB);
        }
        // 特殊处理生日（转为日期比较）
        else if (column === 'birthday') {
            valueA = new Date(valueA);
            valueB = new Date(valueB);
        }
        
        // 比较逻辑
        if (valueA < valueB) {
            return currentSort.direction === 'asc' ? -1 : 1;
        }
        if (valueA > valueB) {
            return currentSort.direction === 'asc' ? 1 : -1;
        }
        return 0;
    });
    
    // 重新渲染列表视图
    renderListView(sortedPlayers);
}

function updateSortIcons() {
    // 移除所有排序图标
    document.querySelectorAll('th i').forEach(icon => {
        icon.className = 'fa-solid fa-sort';
    });
    
    // 为当前排序列添加正确图标
    if (currentSort.column) {
        const th = document.querySelector(`th[onclick="sortTable('${currentSort.column}')"]`);
        if (th) {
            const icon = th.querySelector('i');
            icon.className = currentSort.direction === 'asc' 
                ? 'fa-solid fa-sort-up' 
                : 'fa-solid fa-sort-down';
        }
    }
}

// 从当前搜索条件获取过滤后的球员数据
function getFilteredPlayers() {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    return playerData.filter(p => 
        p.name.toLowerCase().includes(searchTerm) || 
        (p.club_team && p.club_team.toLowerCase().includes(searchTerm))
    );
}