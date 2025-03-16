import styles from './Filter.module.css';

export default function Filter({
    handleSort,
    sortOrder
}) {
    return (
        <div className="filter-container">
            <button className={styles['sort-button']} onClick={handleSort}>
            Sort {sortOrder === "asc" ? "Descending" : "Ascending"}
        </button></div>

    );
}