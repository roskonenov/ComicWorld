import styles from './Filter.module.css';

export default function Filter({
    handleSort,
    sortOrder,
    onSearchChange
}) {

    const changeHandler = (e) => {
        return onSearchChange(e.target.value);
    }

    return (
        <div className={styles['filter-container']}>
            <form className={styles['filter-form']}>
                <input
                    className={styles['title-search']}
                    type="text"
                    name="title-search"
                    id="title-search"
                    onChange={changeHandler}
                    required
                />
                <label htmlFor="title-search">Search by title</label>
            </form>
            <button className={styles['sort-button']} onClick={handleSort}>
                Sort {sortOrder === "asc" ? "Descending" : "Ascending"}
            </button>
        </div>

    );
}