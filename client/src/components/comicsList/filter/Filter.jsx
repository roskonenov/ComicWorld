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
        <div className="filter-container">
            <form className={styles['filter-form']}>
                <input
                    className='title-search'
                    type="text"
                    name="title-search"
                    id="title-search"
                    placeholder='Search by title'
                    onChange={changeHandler}
                />
            </form>
            <button className={styles['sort-button']} onClick={handleSort}>
                Sort {sortOrder === "asc" ? "Descending" : "Ascending"}
            </button>
        </div>

    );
}