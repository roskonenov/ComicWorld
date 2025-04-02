import styles from './Pagination.module.css';

export default function Pagination({
    prevPage,
    currentPage,
    nextPage,
    itemsData,
    itemsPerPage,
}) {
    return (
        <div className='top'>
            < div className={styles['pagination']}>
                <button
                    onClick={prevPage}
                    disabled={currentPage === 1}>
                    <a href="#top">
                        Prev
                    </a>
                </button>
                <span>Page {currentPage}</span>
                <button
                    onClick={nextPage}
                    disabled={currentPage === Math.ceil(itemsData.length / itemsPerPage)}
                >
                    <a href="#top">
                        Next
                    </a>
                </button>
            </div>
        </div>
    );
}