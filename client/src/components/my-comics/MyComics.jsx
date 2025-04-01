import { useSelectedComics } from '../../api/comicApi';
import { useMyComicsId } from '../../api/MyComicsApi';
import Spinner from '../spinner/Spinner';
import styles from './MyComics.module.css'

export default function MyComics() {

    const { comicsId, loading } = useMyComicsId();


    const { pending, comics } = useSelectedComics(comicsId);

    console.log(comics);

    if (loading || pending) {
        return <Spinner />
    }
    return (
        <section className={styles.section}>
            <article className={styles['comic-container']}>

            </article>
        </section>
    );
}