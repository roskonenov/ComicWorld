import { useSelectedComics } from '../../api/comicApi';
import Spinner from '../spinner/Spinner';
import ComicCard from './comic-card/ComicCard';
import styles from './MyComics.module.css'

export default function MyComics() {

    const { loading, comics } = useSelectedComics();

    if (loading ) {
        return <Spinner />
    }
    return (
        <div className={styles.body}>
            <h1 className={styles['page-title']}></h1>
            <section className={styles.section}>
                {comics.length === 0
                    ? <h3 className={styles['no-comics']}>You don&apos;t own any comics yet.</h3>
                    : comics.map(comic => <ComicCard key={comic._id} {...comic}/>)}
            </section>
        </div>
    );
}