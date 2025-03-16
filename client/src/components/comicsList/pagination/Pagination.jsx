import styles from './Pagination.module.css';

export default function Pagination({
    prevPage,
    currentPage,
    nextPage,
    comicsData,
    comicsPerPage,
}) {
    return (
        < div className={styles['pagination']}>
            <button onClick={prevPage} disabled={currentPage === 1}>
                Prev
            </button>
            <span>Page {currentPage}</span>
            <button
                onClick={nextPage}
                disabled={currentPage === Math.ceil(comicsData.length / comicsPerPage)}
            >
                Next
            </button>
        </div>
   );
}