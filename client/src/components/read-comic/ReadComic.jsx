import { useEffect, useState } from 'react';
import { useComicContent } from '../../api/comicApi';
import { useParams } from 'react-router';
import Pagination from '../comicsList/pagination/Pagination';
import Spinner from '../spinner/Spinner';
import styles from './ReadComic.module.css'

export default function ReadComic() {
    const { comicId } = useParams();
    const { content, loading } = useComicContent(comicId);

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 1;
    const totalPages = Object.keys(content).length;

    useEffect(() => {
        if(content[currentPage + 1]) {
            const img = new window.Image();
            img.src = content[currentPage + 1];
        }
    }, [content, currentPage]);

    const nextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage(prev => prev + 1);
        }
    };

    const prevPage = () => {
        if (currentPage > 1) {
            setCurrentPage(prev => prev - 1);
        }
    };

    if (loading) {
        return <Spinner />;
    }
    return (
        <div className={styles.body}>
            <section className={styles['section']}>
                <Pagination
                    prevPage={prevPage}
                    currentPage={currentPage}
                    nextPage={nextPage}
                    itemsData={Object.values(content)}
                    itemsPerPage={itemsPerPage}
                />
                <div className={styles['page-container']}>
                    <img src={content[currentPage]} alt={`Page ${currentPage}`} />
                </div>
                <Pagination
                    prevPage={prevPage}
                    currentPage={currentPage}
                    nextPage={nextPage}
                    itemsData={Object.values(content)}
                    itemsPerPage={itemsPerPage}
                />
            </section>
        </div>
    );
}

