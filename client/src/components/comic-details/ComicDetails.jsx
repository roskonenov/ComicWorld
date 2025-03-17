import useGetResources from '../../hooks/useGetResources';
import Spinner from '../spinner/Spinner';
import styles from './ComicDetails.module.css';
import { useParams } from 'react-router';

export default function ComicDetails() {
    const {comicId} = useParams();

    const [loading, comic] = useGetResources(`http://localhost:3030/jsonstore/comics-info/${comicId}`);

    if (loading) {
        return <Spinner />;
    }
    return (
        <section className={styles['details-section']}>
            <div className={styles['details-container']}>
                <div className={styles['cover-container']}>
                    <div className="cover">
                        <img src="" alt="" />
                    </div>
                </div>
                <div className={styles['info-container']}></div>
            </div>
        </section>
    );
}